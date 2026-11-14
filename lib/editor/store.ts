import { toast } from "sonner"
import { createStore } from "zustand/vanilla"

import * as actions from "@/app/actions/boards"
import type { BoardView, NodeView } from "@/lib/board/repo"
import type { NodeType } from "@/lib/db/schema"

import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "./local-draft"

/*
 * Editor state for one board (option A: the editor shows the selected node).
 *
 * - Target: an existing node, or a "new" slot (a branch not saved yet).
 * - Draft: the text in the editor. It only becomes a version on Revise,
 *   Branch instead, or when the owner leaves the node (auto-saved revise).
 * - Leaving = switching node, starting a new branch, opening the graph or another board.
 */

export type Target =
  { kind: "node"; nodeId: string } | { kind: "new"; parentId: string | null }

type EditorState = {
  boardId: string | null
  title: string
  savedTitle: string
  view: BoardView | null
  target: Target
  draft: string
  note: string
  busy: boolean
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
  setType: (type: NodeType | null) => Promise<void>
  deleteCurrent: () => Promise<void>
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

/** The node the editor is "on": the target node, or the parent of a new branch. */
export function anchorNodeId(target: Target) {
  return target.kind === "node" ? target.nodeId : target.parentId
}

/** The most recently edited node, used as the starting node when a board opens. */
function initialTarget(view: BoardView | null): Target {
  if (!view?.nodes.length) return { kind: "new", parentId: null }
  const latest = [...view.nodes].sort(
    (a, b) => +b.lastEditedAt - +a.lastEditedAt
  )[0]
  return { kind: "node", nodeId: latest.id }
}

// ---------- Store ----------

export function createEditorStore(initialView: BoardView | null) {
  const target = initialTarget(initialView)
  const initial: EditorState = {
    boardId: initialView?.board.id ?? null,
    title: initialView?.board.title ?? "",
    savedTitle: initialView?.board.title ?? "",
    view: initialView,
    target,
    draft: savedTextOf({ view: initialView, target }),
    note: "",
    busy: false,
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

    async function refresh(boardId: string) {
      const result = await actions.getBoard({ boardId })
      if (result.ok) set({ view: result.data })
      else fail(result.error.message)
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
        return result.data.firstNodeId
      }

      const result = await actions.createNode({
        boardId: state.boardId,
        text: state.draft,
        parentId: state.target.parentId,
      })
      if (!result.ok) return fail(result.error.message)
      clearLocalDraft(state.boardId, state.target)
      await refresh(state.boardId)
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
            return
          }
          const result = await actions.renameBoard({ boardId, title: trimmed })
          if (!result.ok) return void fail(result.error.message)
          set({ savedTitle: result.data.title })
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
          open({ kind: "node", nodeId: result.data.nodeId })
        }),

      discard: () => {
        const { boardId, target } = get()
        clearLocalDraft(boardId, target)
        set({ draft: savedTextOf(get()), note: "" })
      },

      goTo: (next) =>
        serial(async () => {
          if ((await commit(true)) === false) return
          open(next)
        }),

      newBranch: () =>
        serial(async () => {
          const savedTo = await commit(true)
          // false: saving failed. null: already on an empty new branch, so stay on it.
          if (!savedTo) return
          open({ kind: "new", parentId: savedTo })
        }),

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
          const parentId = node?.parentId ?? null
          open(
            parentId
              ? { kind: "node", nodeId: parentId }
              : initialTarget(get().view)
          )

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
                  open(target)
                }),
            },
          })
        }),
    }
  })
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>
