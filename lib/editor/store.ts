import { toast } from "sonner"
import { createStore } from "zustand/vanilla"

import * as aiActions from "@/app/actions/ai"
import * as actions from "@/app/actions/boards"
import * as criticActions from "@/app/actions/critic"
import type { Mode } from "@/components/board-header"
import type { BoardView, NodeView } from "@/lib/board/repo"
import { branchPlaceholder, nodeLabel } from "@/lib/board/labels"
import type { FindingView } from "@/lib/critic/repo"
import { argumentTypeFor } from "@/lib/critic/stance"
import type { NodeType, Stance } from "@/lib/db/schema"

import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "./local-draft"

/*
 * Editor state for one board (option A: the editor shows the selected node).
 *
 * - Target: an existing node, or a "new" slot (a branch not saved yet, optionally typed,
 *   e.g. a Critic For/Against argument).
 * - Draft: the text in the editor. It only becomes a version on Revise,
 *   Branch instead, or when the owner leaves the node (auto-saved revise).
 * - Leaving = switching node, starting a new branch, opening the graph or another board.
 *   In Critic mode with AI on, every leave also schedules an AI review (SPEC.md 6.2, D24).
 */

export type Target =
  | { kind: "node"; nodeId: string }
  | { kind: "new"; parentId: string | null; type?: NodeType | null }

export type Screen = "editor" | "graph"

export type CriticState = {
  /** reviewing = an AI review is running; error = the last one failed (see `error`). */
  status: "idle" | "reviewing" | "error"
  findings: FindingView[]
  error: string | null
  /** True once a review has finished for this board in this session. */
  reviewed: boolean
  /** The finding an accept/dismiss is running for. */
  actingOn: string | null
}

type EditorState = {
  /** Writing screen or the board graph (the graph replaces the editor). */
  screen: Screen
  /** Brainstorm or Critic (SPEC.md 6). Saved per browser. */
  mode: Mode
  boardId: string | null
  title: string
  savedTitle: string
  view: BoardView | null
  target: Target
  draft: string
  note: string
  busy: boolean
  /** The global AI toggle (SPEC.md 6.3). Off = no AI calls of any kind. */
  aiEnabled: boolean
  critic: CriticState
}

type EditorActions = {
  setTitle: (title: string) => void
  setDraft: (text: string) => void
  setNote: (note: string) => void
  /** Load the local draft for the current target (call once after mount). */
  restoreLocalDraft: () => void
  commitTitle: () => Promise<void>
  /** Explicit Revise (or Save, for a new node). Stays on the node. */
  revise: () => Promise<void>
  /** Save the edits as a new child; the original keeps its saved text. */
  branchInstead: () => Promise<void>
  discard: () => void
  /** Leave the current node (auto-saving edits as a revise) and open another target. */
  goTo: (target: Target) => Promise<void>
  /** Leave the current node and open an empty branch under it. */
  newBranch: () => Promise<void>
  /** Critic: leave the current node and open an empty For/Against argument or verdict under it. */
  newArgument: (kind: Stance | "verdict") => Promise<void>
  /** Leave the current node before navigating away (auto-saves edits). False if saving failed. */
  leaveNode: () => Promise<boolean>
  /** Leave the current node (auto-saving edits) and show the graph. */
  showGraph: () => Promise<void>
  showEditor: () => void
  /** From the graph: open a node in the editor. */
  openFromGraph: (nodeId: string) => Promise<void>
  setType: (type: NodeType | null) => Promise<void>
  deleteCurrent: () => Promise<void>
  setAiEnabled: (enabled: boolean) => void
  setMode: (mode: Mode) => void
  /** Load the saved AI toggle and mode (call once after mount; localStorage is browser-only). */
  restorePreferences: () => void
  /** Critic: load the stored pending findings (no AI call). */
  loadFindings: () => Promise<void>
  /** Critic: run a review now (the panel's retry / review button). */
  reviewNow: () => void
  acceptFinding: (findingId: string) => Promise<void>
  dismissFinding: (findingId: string) => Promise<void>
}

export type EditorStore = EditorState & EditorActions

// ---------- Pure helpers (also used by components) ----------

export function nodeById(
  view: BoardView | null,
  id: string
): NodeView | undefined {
  return view?.nodes.find((n) => n.id === id)
}

export function savedTextOf(state: Pick<EditorState, "view" | "target">) {
  return state.target.kind === "node"
    ? (nodeById(state.view, state.target.nodeId)?.text ?? "")
    : ""
}

export function isDirty(state: Pick<EditorState, "view" | "target" | "draft">) {
  return state.target.kind === "node"
    ? state.draft !== savedTextOf(state)
    : state.draft.trim().length > 0
}

/**
 * Title an unsaved new branch will get: `B<n>: <parent title>`, the same rule the
 * server uses when it saves (lib/board/repo.ts). Null for a new root thought.
 */
export function newBranchTitle(view: BoardView | null, target: Target) {
  if (target.kind !== "new" || !target.parentId) return null
  const parent = nodeById(view, target.parentId)
  if (!parent) return null
  return branchPlaceholder(parent.branchCount + 1, nodeLabel(parent, 40))
}

/** The node the editor is "on": the target node, or the parent of a new branch. */
export function anchorNodeId(target: Target) {
  return target.kind === "node" ? target.nodeId : target.parentId
}

/** The node a board opens on: the requested one if it exists, else the most recently edited. */
function initialTarget(view: BoardView | null, nodeId?: string | null): Target {
  if (!view?.nodes.length) return { kind: "new", parentId: null }
  if (nodeId && view.nodes.some((n) => n.id === nodeId))
    return { kind: "node", nodeId }
  const latest = [...view.nodes].sort(
    (a, b) => +b.lastEditedAt - +a.lastEditedAt
  )[0]
  return { kind: "node", nodeId: latest.id }
}

// ---------- Store ----------

const AI_ENABLED_KEY = "engram:ai-enabled"
const MODE_KEY = "engram:mode"
/** Wait this long after a leave before reviewing, so quick hops trigger one review. */
const REVIEW_DEBOUNCE_MS = 1_200

/** E2E builds only: count review requests so the browser test can prove navigation costs none. */
function countReviewRequest() {
  if (process.env.NEXT_PUBLIC_E2E !== "1") return
  const w = window as unknown as { __engramReviewRequests?: number }
  w.__engramReviewRequests = (w.__engramReviewRequests ?? 0) + 1
}
const emptyCritic: CriticState = {
  status: "idle",
  findings: [],
  error: null,
  reviewed: false,
  actingOn: null,
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the setting still works for this session.
  }
}

export function createEditorStore(
  initialView: BoardView | null,
  initialNodeId?: string | null
) {
  const target = initialTarget(initialView, initialNodeId)
  const initial: EditorState = {
    screen: "editor",
    mode: "brainstorm",
    boardId: initialView?.board.id ?? null,
    title: initialView?.board.title ?? "",
    savedTitle: initialView?.board.title ?? "",
    view: initialView,
    target,
    draft: savedTextOf({ view: initialView, target }),
    note: "",
    busy: false,
    aiEnabled: true,
    critic: emptyCritic,
  }

  return createStore<EditorStore>()((set, get) => {
    // Run writes one at a time so a fast "leave" can't race a "revise".
    let queue: Promise<unknown> = Promise.resolve()
    const serial = <T>(fn: () => Promise<T>): Promise<T> => {
      const next = queue.then(async () => {
        set({ busy: true })
        try {
          return await fn()
        } finally {
          set({ busy: false })
        }
      })
      queue = next.catch(() => undefined)
      return next
    }

    const fail = (message: string) => {
      toast.error(message)
      return false as const
    }

    const setCritic = (patch: Partial<CriticState>) =>
      set({ critic: { ...get().critic, ...patch } })

    async function refresh(boardId: string) {
      const result = await actions.getBoard({ boardId })
      if (result.ok) set({ view: result.data })
      else fail(result.error.message)
    }

    // ---- Critic reviews (SPEC.md 6.2, 7.4, D24) ----
    // `revision` counts board changes in this session; a review only runs when the board
    // changed since the last one (the server also skips unchanged boards by hash).
    // Only real edits bump it: switching branches, opening the graph, a failed review or a
    // dismissal never trigger a review on their own. "Review now" runs one on demand.
    let revision = 0
    let reviewedRevision = 0
    let reviewTimer: ReturnType<typeof setTimeout> | null = null
    let reviewFocus: string | null = null
    let reviewing = false
    let reviewAgain = false

    const markChanged = () => {
      revision++
    }

    const reviewsOn = () => {
      const s = get()
      return s.mode === "critic" && s.aiEnabled && s.boardId !== null
    }

    /** Called after every leave event. Debounced; `now` skips the wait (leaving the board). */
    function afterLeave(focusNodeId: string | null, now = false) {
      if (!reviewsOn() || revision === reviewedRevision) return
      reviewFocus = focusNodeId ?? reviewFocus
      if (reviewTimer) clearTimeout(reviewTimer)
      reviewTimer = setTimeout(
        () => void runReview(),
        now ? 0 : REVIEW_DEBOUNCE_MS
      )
    }

    async function runReview() {
      reviewTimer = null
      if (!reviewsOn()) return
      if (reviewing) {
        reviewAgain = true
        return
      }
      const boardId = get().boardId!
      const startedAt = revision
      reviewing = true
      countReviewRequest()
      setCritic({ status: "reviewing", error: null })
      try {
        const result = await criticActions.reviewBoard({
          boardId,
          focusNodeId: reviewFocus,
        })
        if (get().boardId !== boardId) return
        if (result.ok) {
          setCritic({
            status: "idle",
            findings: result.data.findings,
            error: null,
            reviewed: true,
          })
        } else {
          setCritic({ status: "error", error: result.error.message })
        }
      } catch (error) {
        console.error("[critic] review request failed", error)
        setCritic({
          status: "error",
          error: "Couldn't reach the server for a review.",
        })
      } finally {
        // Success or failure, this version of the board has had its turn: a failed review
        // is retried by the next real change or by "Try again", never by plain navigation.
        reviewedRevision = startedAt
        reviewing = false
        // Changes made while the AI was thinking get their own review.
        if (reviewAgain || revision !== startedAt) {
          reviewAgain = false
          if (revision !== reviewedRevision) afterLeave(reviewFocus)
        }
      }
    }

    // ---- AI titles (SPEC.md D20) ----
    // One request per node at a time. A save during a request queues one re-run, and the
    // server only applies a title written for the node's latest version.
    const titling = new Map<string, { rerun: boolean }>()

    function requestTitle(nodeId: string) {
      if (!get().aiEnabled) return
      const running = titling.get(nodeId)
      if (running) {
        running.rerun = true
        return
      }
      const entry = { rerun: false }
      titling.set(nodeId, entry)
      void aiActions
        .titleNode({ nodeId })
        .then((result) => {
          if (!result.ok) {
            // One toast at a time; capture keeps working without titles.
            toast.error(result.error.message, { id: "ai-title-error" })
            return
          }
          if (result.data.status === "applied") {
            patchNode(nodeId, { title: result.data.title, titleSource: "ai" })
          }
        })
        .catch(() =>
          toast.error("Couldn't reach the server for an AI title.", {
            id: "ai-title-error",
          })
        )
        .finally(() => {
          titling.delete(nodeId)
          if (entry.rerun) requestTitle(nodeId)
        })
    }

    /** Update one node in the loaded board without refetching it. */
    function patchNode(nodeId: string, patch: Partial<NodeView>) {
      const view = get().view
      if (!view?.nodes.some((n) => n.id === nodeId)) return
      set({
        view: {
          ...view,
          nodes: view.nodes.map((n) =>
            n.id === nodeId ? { ...n, ...patch } : n
          ),
        },
      })
    }

    /** Mirror unsaved edits to localStorage; drop the entry once nothing is unsaved. */
    function persistLocal() {
      const state = get()
      if (isDirty(state)) {
        writeLocalDraft(state.boardId, state.target, {
          text: state.draft,
          note: state.note,
        })
      } else {
        clearLocalDraft(state.boardId, state.target)
      }
    }

    /** Open a target, loading any unsaved local draft for it. */
    function open(next: Target) {
      const { boardId, view } = get()
      const local = readLocalDraft(boardId, next)
      set({
        target: next,
        draft: local?.text ?? savedTextOf({ view, target: next }),
        note: local?.note ?? "",
      })
    }

    /**
     * Save the current draft. Returns the id of the node it was saved to,
     * null if there was nothing to save, or false if saving failed.
     */
    async function commit(autoSaved: boolean): Promise<string | null | false> {
      const state = get()
      if (!isDirty(state))
        return state.target.kind === "node" ? state.target.nodeId : null

      if (state.draft.trim().length === 0) {
        return fail(
          "A thought can't be empty. Discard the change or delete the node instead."
        )
      }

      if (state.target.kind === "node") {
        const result = await actions.reviseNode({
          nodeId: state.target.nodeId,
          text: state.draft,
          note: state.note || undefined,
          autoSaved,
        })
        if (!result.ok) return fail(result.error.message)
        clearLocalDraft(state.boardId, state.target)
        await refresh(state.boardId!)
        if (result.data.changed) {
          markChanged()
          requestTitle(state.target.nodeId)
        }
        return state.target.nodeId
      }

      // A new node. The very first thought also creates the board.
      if (!state.boardId) {
        const result = await actions.createBoard({
          title: state.title,
          firstText: state.draft,
        })
        if (!result.ok) return fail(result.error.message)
        const boardId = result.data.board.id
        clearLocalDraft(null, state.target)
        set({ boardId, savedTitle: result.data.board.title })
        window.history.replaceState(null, "", `/b/${boardId}`)
        await refresh(boardId)
        markChanged()
        if (result.data.firstNodeId) requestTitle(result.data.firstNodeId)
        return result.data.firstNodeId
      }

      const result = await actions.createNode({
        boardId: state.boardId,
        text: state.draft,
        parentId: state.target.parentId,
        type: state.target.type ?? undefined,
      })
      if (!result.ok) return fail(result.error.message)
      clearLocalDraft(state.boardId, state.target)
      await refresh(state.boardId)
      markChanged()
      requestTitle(result.data.nodeId)
      return result.data.nodeId
    }

    return {
      ...initial,

      setTitle: (title) => set({ title: title.replace(/\n/g, "") }),

      setDraft: (draft) => {
        set({ draft })
        persistLocal()
      },

      setNote: (note) => {
        set({ note })
        persistLocal()
      },

      restoreLocalDraft: () => open(get().target),

      commitTitle: () =>
        serial(async () => {
          const { boardId, title, savedTitle } = get()
          const trimmed = title.trim()
          if (trimmed === savedTitle.trim()) return
          if (!boardId) {
            // Wait for the first thought or a title before creating a board.
            if (!trimmed) return
            const result = await actions.createBoard({ title: trimmed })
            if (!result.ok) return void fail(result.error.message)
            // Keep any draft typed before the board existed.
            const { target, draft, note } = get()
            clearLocalDraft(null, target)
            set({
              boardId: result.data.board.id,
              savedTitle: result.data.board.title,
            })
            writeLocalDraft(result.data.board.id, target, { text: draft, note })
            window.history.replaceState(null, "", `/b/${result.data.board.id}`)
            await refresh(result.data.board.id)
            markChanged()
            return
          }
          const result = await actions.renameBoard({ boardId, title: trimmed })
          if (!result.ok) return void fail(result.error.message)
          set({ savedTitle: result.data.title })
          // The title is the claim: renaming it is worth a fresh look.
          markChanged()
          afterLeave(anchorNodeId(get().target))
        }),

      revise: () =>
        serial(async () => {
          const savedTo = await commit(false)
          if (savedTo === false || savedTo === null) return
          open({ kind: "node", nodeId: savedTo })
        }),

      branchInstead: () =>
        serial(async () => {
          const state = get()
          if (state.target.kind !== "node" || !isDirty(state) || !state.boardId)
            return
          if (state.draft.trim().length === 0)
            return void fail("A branch can't be empty.")
          const original = state.target
          const result = await actions.createNode({
            boardId: state.boardId,
            text: state.draft,
            parentId: original.nodeId,
          })
          if (!result.ok) return void fail(result.error.message)
          clearLocalDraft(state.boardId, original)
          await refresh(state.boardId)
          markChanged()
          requestTitle(result.data.nodeId)
          open({ kind: "node", nodeId: result.data.nodeId })
          afterLeave(original.nodeId)
        }),

      discard: () => {
        const { boardId, target } = get()
        clearLocalDraft(boardId, target)
        set({ draft: savedTextOf(get()), note: "" })
      },

      goTo: (next) =>
        serial(async () => {
          const left = anchorNodeId(get().target)
          const savedTo = await commit(true)
          if (savedTo === false) return
          open(next)
          afterLeave(savedTo ?? left)
        }),

      newBranch: () =>
        serial(async () => {
          const savedTo = await commit(true)
          // false: saving failed. null: already on an empty new branch, so stay on it.
          if (!savedTo) return
          open({ kind: "new", parentId: savedTo })
          afterLeave(savedTo)
        }),

      newArgument: (kind) =>
        serial(async () => {
          const before = get().target
          const savedTo = await commit(true)
          if (savedTo === false) return
          // On an empty new slot, switch the slot's kind instead of nesting under nothing.
          const parentId =
            savedTo ?? (before.kind === "new" ? before.parentId : null)
          if (!parentId) return
          const parent = nodeById(get().view, parentId)
          const type: NodeType =
            kind === "verdict"
              ? "verdict"
              : argumentTypeFor(kind, parent?.type ?? null)
          open({ kind: "new", parentId, type })
          if (savedTo) afterLeave(savedTo)
        }),

      leaveNode: () =>
        serial(async () => {
          const left = anchorNodeId(get().target)
          const savedTo = await commit(true)
          if (savedTo === false) return false
          // Leaving the board: review right away so findings are ready on return.
          afterLeave(savedTo ?? left, true)
          return true
        }),

      showGraph: () =>
        serial(async () => {
          const left = anchorNodeId(get().target)
          const savedTo = await commit(true)
          if (savedTo === false) return
          set({ screen: "graph" })
          afterLeave(savedTo ?? left)
        }),

      showEditor: () => set({ screen: "editor" }),

      openFromGraph: async (nodeId) => {
        await get().goTo({ kind: "node", nodeId })
        set({ screen: "editor" })
      },

      setAiEnabled: (aiEnabled) => {
        set({ aiEnabled })
        store(AI_ENABLED_KEY, aiEnabled ? "1" : "0")
        if (!aiEnabled && reviewTimer) {
          clearTimeout(reviewTimer)
          reviewTimer = null
        }
        if (aiEnabled && get().mode === "critic") void get().loadFindings()
      },

      setMode: (mode) => {
        set({ mode })
        store(MODE_KEY, mode)
        if (mode === "critic" && get().aiEnabled) void get().loadFindings()
      },

      restorePreferences: () => {
        try {
          const ai = window.localStorage.getItem(AI_ENABLED_KEY)
          if (ai !== null) set({ aiEnabled: ai === "1" })
          const mode = window.localStorage.getItem(MODE_KEY)
          if (mode === "critic" || mode === "brainstorm") set({ mode })
        } catch {
          // ignore
        }
        if (get().mode === "critic" && get().aiEnabled)
          void get().loadFindings()
      },

      loadFindings: async () => {
        const { boardId } = get()
        if (!boardId) return
        try {
          const result = await criticActions.listFindings({ boardId })
          if (get().boardId !== boardId) return
          // A finished review is newer than what's stored; don't overwrite it.
          if (result.ok && !get().critic.reviewed && !reviewing)
            setCritic({ findings: result.data })
        } catch (error) {
          console.error("[critic] could not load findings", error)
        }
      },

      reviewNow: () => {
        if (!reviewsOn()) return
        // Explicit request: run even if nothing changed (the server still skips unchanged boards).
        reviewedRevision = -1
        reviewFocus = anchorNodeId(get().target) ?? reviewFocus
        void runReview()
      },

      acceptFinding: (findingId) =>
        serial(async () => {
          const { boardId } = get()
          if (!boardId) return
          setCritic({ actingOn: findingId })
          try {
            const result = await criticActions.acceptFinding({ findingId })
            const remove = () =>
              setCritic({
                findings: get().critic.findings.filter(
                  (f) => f.id !== findingId
                ),
              })
            if (!result.ok) {
              fail(result.error.message)
              // Already handled or its thought is gone: it can't be acted on any more.
              if (
                result.error.code === "INVALID" ||
                result.error.code === "NOT_FOUND"
              )
                remove()
              return
            }
            remove()
            if (result.data.nodeId || result.data.connectionId) {
              markChanged()
              await refresh(boardId)
            }
            const nodeId = result.data.nodeId
            if (nodeId) {
              toast("Added to your board", {
                description: "Marked as written by AI.",
                action: {
                  label: "Open",
                  onClick: () => void get().goTo({ kind: "node", nodeId }),
                },
              })
            } else if (result.data.connectionId) {
              toast("Linked. You'll see it in the graph.")
            }
          } catch (error) {
            console.error("[critic] accept failed", error)
            fail("Couldn't reach the server. Try again.")
          } finally {
            setCritic({ actingOn: null })
          }
        }),

      dismissFinding: async (findingId) => {
        const before = get().critic.findings
        // Optimistic: hide it now, put it back if the server says no.
        setCritic({ findings: before.filter((f) => f.id !== findingId) })
        try {
          const result = await criticActions.dismissFinding({ findingId })
          if (!result.ok) {
            fail(result.error.message)
            if (
              result.error.code !== "INVALID" &&
              result.error.code !== "NOT_FOUND"
            )
              setCritic({ findings: before })
            return
          }
          // Not a board change: the next real edit reviews again and sends the dismissal along.
        } catch (error) {
          console.error("[critic] dismiss failed", error)
          setCritic({ findings: before })
          fail("Couldn't reach the server. Try again.")
        }
      },

      setType: (type) =>
        serial(async () => {
          const { target, boardId } = get()
          if (target.kind !== "node" || !boardId) return
          const result = await actions.setNodeType({
            nodeId: target.nodeId,
            type,
          })
          if (!result.ok) return void fail(result.error.message)
          await refresh(boardId)
          markChanged()
        }),

      deleteCurrent: () =>
        serial(async () => {
          const { target, boardId, view } = get()
          if (target.kind !== "node" || !boardId) return
          const node = nodeById(view, target.nodeId)
          const result = await actions.deleteNode({ nodeId: target.nodeId })
          if (!result.ok) return void fail(result.error.message)
          clearLocalDraft(boardId, target)
          await refresh(boardId)
          markChanged()
          const parentId = node?.parentId ?? null
          open(
            parentId
              ? { kind: "node", nodeId: parentId }
              : initialTarget(get().view)
          )
          afterLeave(parentId)

          toast("Thought deleted", {
            action: {
              label: "Undo",
              onClick: () =>
                void serial(async () => {
                  const undo = await actions.restoreNode({
                    nodeId: target.nodeId,
                  })
                  if (!undo.ok) return void fail(undo.error.message)
                  await refresh(boardId)
                  markChanged()
                  open(target)
                }),
            },
          })
        }),
    }
  })
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>
