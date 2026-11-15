"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"
import {
  history,
  historyKeymap,
  insertNewline,
  standardKeymap,
} from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"

import { StanceDot } from "@/components/critic/stance"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { LIMITS } from "@/lib/board/inputs"
import { nodeLabel } from "@/lib/board/labels"
import {
  canCreateMention,
  mentionOptions,
  type MentionOption,
  type MentionTrigger,
} from "@/lib/board/mentions"
import { useEditor } from "@/lib/editor/provider"
import { nodeById, type Target } from "@/lib/editor/store"

import { formatExtensions } from "./format-extension"
import { FormatToolbar, type FormatSelection } from "./format-toolbar"
import {
  currentTrigger,
  ExternalChange,
  insertMention,
  insertMentionAtCursor,
  maxLength,
  mentionExtensions,
  refreshMentions,
  type MentionHost,
} from "./mention-extension"

/*
 * The thought body: a CodeMirror editor whose text is the same plain string the store keeps
 * as `draft`. `[[` opens a picker of the board's thoughts; a finished tag is drawn as a pill.
 * React owns the picker UI, CodeMirror owns the text; they meet in `MentionHost`.
 */

type Row =
  { kind: "node"; option: MentionOption } | { kind: "create"; name: string }

const CREATE_VALUE = "__create__"
const PICKER_WIDTH = 288
const PICKER_HEIGHT = 288

const rowValue = (row: Row) =>
  row.kind === "create" ? CREATE_VALUE : row.option.id

/** What the empty body invites you to write. */
export function bodyPlaceholder(target: Target) {
  if (target.kind !== "new") return "flow your words"
  if (target.type === "evidence") return "why does this hold up?"
  if (target.type === "objection") return "what's wrong with it?"
  if (target.type === "defense") return "your comeback..."
  if (target.type === "verdict") return "where do you land, in your own words?"
  return target.parentId ? "a new branch..." : "flow your words"
}

const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0",
    minHeight: "6.8em",
    caretColor: "var(--foreground)",
  },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--muted-foreground)", opacity: "0.8" },
})

/** A ref that always holds the latest value, updated after each render (never during it). */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

export default function BodyEditor({ onType }: { onType: () => void }) {
  const draft = useEditor((s) => s.draft)
  const target = useEditor((s) => s.target)
  const view = useEditor((s) => s.view)
  const mode = useEditor((s) => s.mode)
  const setDraft = useEditor((s) => s.setDraft)
  const restoreLocalDraft = useEditor((s) => s.restoreLocalDraft)
  const revise = useEditor((s) => s.revise)
  const branchInstead = useEditor((s) => s.branchInstead)
  const newBranch = useEditor((s) => s.newBranch)
  const goTo = useEditor((s) => s.goTo)
  const createTaggedBranch = useEditor((s) => s.createTaggedBranch)
  const isNewBoard = useEditor((s) => s.boardId === null)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // CodeMirror callbacks outlive renders, so they read the latest values through this ref.
  const latest = useLatest({
    draft,
    target,
    view,
    mode,
    setDraft,
    onType,
    revise,
    branchInstead,
    newBranch,
    goTo,
    createTaggedBranch,
  })

  // ---- Picker state ----
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<MentionTrigger | null>(null)
  const [selection, setSelection] = useState<FormatSelection | null>(null)
  const creating = useRef(false)

  const currentId = target.kind === "node" ? target.nodeId : null
  const rows = useMemo<Row[]>(() => {
    if (!trigger) return []
    const nodes = view?.nodes ?? []
    const options = mentionOptions(nodes, trigger.query, currentId, (n) =>
      nodeLabel(n, 60)
    )
    const list: Row[] = options.map((option) => ({ kind: "node", option }))
    // New branches are for brainstorming, and need a saved thought to hang from.
    if (
      mode !== "critic" &&
      currentId !== null &&
      canCreateMention(options, trigger.query)
    )
      list.push({ kind: "create", name: trigger.query.trim() })
    return list
  }, [trigger, view, mode, currentId])

  const rowsRef = useLatest(rows)
  const activeRef = useLatest(active)

  const pick = useCallback(
    async (row: Row) => {
      const editor = viewRef.current
      const open = editor && currentTrigger(editor)
      if (!editor || !open || creating.current) return

      if (row.kind === "node") {
        insertMention(editor, open, row.option.label, row.option.id)
        return
      }
      creating.current = true
      try {
        const created = await latest.current.createTaggedBranch(row.name)
        if (!created || viewRef.current !== editor) return
        // The owner may have kept typing while the branch was created.
        const now = currentTrigger(editor)
        if (now) insertMention(editor, now, created.title, created.id)
        else insertMentionAtCursor(editor, created.title, created.id)
      } finally {
        creating.current = false
      }
    },
    [latest]
  )
  const pickRef = useLatest(pick)

  const host = useMemo<MentionHost>(
    () => ({
      resolve: (id, fallbackTitle) => {
        const node = nodeById(latest.current.view, id)
        return node
          ? { title: nodeLabel(node, 40), type: node.type, missing: false }
          : {
              title: fallbackTitle || "Missing thought",
              type: null,
              missing: true,
            }
      },
      colored: () => latest.current.mode === "critic",
      open: (id) => {
        const { target: t, goTo: go } = latest.current
        if (t.kind === "node" && t.nodeId === id) return
        void go({ kind: "node", nodeId: id })
      },
      onTrigger: (next) => {
        const previous = triggerRef.current
        triggerRef.current = next
        if (!previous || !next || previous.from !== next.from) setActive(0)
        else if (previous.query !== next.query) setActive(0)
        setTrigger(next)
      },
      key: (key) => {
        if (creating.current) return true
        const list = rowsRef.current
        if (list.length === 0) return false
        if (key === "select") {
          void pickRef.current(
            list[Math.min(activeRef.current, list.length - 1)]
          )
          return true
        }
        const step = key === "down" ? 1 : -1
        setActive((i) => (i + step + list.length) % list.length)
        return true
      },
    }),
    [latest, rowsRef, activeRef, pickRef]
  )

  const formatHost = useMemo(
    () => ({
      onSelection: (next: FormatSelection | null) => setSelection(next),
    }),
    []
  )

  const buildState = useCallback(
    (doc: string, hint: string) =>
      EditorState.create({
        doc,
        extensions: [
          history(),
          mentionExtensions(host),
          formatExtensions(formatHost),
          keymap.of([
            {
              key: "Mod-Shift-Enter",
              run: () => (void latest.current.branchInstead(), true),
            },
            {
              key: "Mod-Enter",
              run: () => (void latest.current.revise(), true),
            },
            {
              key: "Alt-Enter",
              run: () => (void latest.current.newBranch(), true),
            },
            // Plain Enter is a plain newline: no code-style auto-indent in prose.
            { key: "Enter", run: insertNewline },
            ...standardKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          placeholder(hint),
          maxLength(LIMITS.nodeText),
          editorTheme,
          EditorView.contentAttributes.of({
            id: "thought-body",
            "aria-label": "Thought",
            spellcheck: "true",
            autocapitalize: "sentences",
          }),
          EditorView.updateListener.of((update) => {
            if (
              !update.docChanged ||
              update.transactions.some((tr) => tr.annotation(ExternalChange))
            )
              return
            latest.current.setDraft(update.state.doc.toString())
            latest.current.onType()
          }),
        ],
      }),
    [host, formatHost, latest]
  )

  // Mount once. React StrictMode runs this twice in development, hence the cleanup.
  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return
    const editor = new EditorView({
      parent,
      state: buildState(
        latest.current.draft,
        bodyPlaceholder(latest.current.target)
      ),
    })
    viewRef.current = editor
    return () => {
      editor.destroy()
      viewRef.current = null
    }
  }, [buildState, latest])

  // Local drafts can only be read in the browser, so load them after mount.
  useEffect(() => {
    restoreLocalDraft()
  }, [restoreLocalDraft])

  // Moving to another node: fresh editor state (so undo can't reach into another thought),
  // focused with the cursor at the end.
  const targetKey =
    target.kind === "node" ? target.nodeId : `new:${target.parentId}`
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    const editor = viewRef.current
    if (!editor) return
    // Same key = first run (or React StrictMode re-running it): keep the state built at mount.
    const moved = lastKey.current !== null && lastKey.current !== targetKey
    lastKey.current = targetKey
    if (moved) {
      editor.setState(
        buildState(latest.current.draft, bodyPlaceholder(latest.current.target))
      )
      triggerRef.current = null
      setTrigger(null)
      setSelection(null)
    } else if (isNewBoard) {
      return
    }
    editor.focus()
    editor.dispatch({ selection: { anchor: editor.state.doc.length } })
  }, [targetKey, isNewBoard, buildState, latest])

  // Draft changed outside the editor (discard, restored local draft): show it.
  useEffect(() => {
    const editor = viewRef.current
    if (!editor || draft === editor.state.doc.toString()) return
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: draft },
      selection: { anchor: draft.length },
      annotations: ExternalChange.of(true),
    })
  }, [draft])

  // A rename, a delete or a mode switch changes how pills look.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshMentions.of(null) })
  }, [view, mode])

  return (
    <>
      <div
        ref={containerRef}
        className="mt-[52px] w-full max-w-3xl font-serif text-[22px] leading-[1.7] text-foreground"
      />
      {selection && <FormatToolbar viewRef={viewRef} selection={selection} />}
      {trigger && (
        <MentionPicker
          viewRef={viewRef}
          trigger={trigger}
          rows={rows}
          active={active}
          colored={mode === "critic"}
          onActive={setActive}
          onPick={(row) => void pick(row)}
        />
      )}
    </>
  )
}

function MentionPicker({
  viewRef,
  trigger,
  rows,
  active,
  colored,
  onActive,
  onPick,
}: {
  viewRef: RefObject<EditorView | null>
  trigger: MentionTrigger
  rows: Row[]
  active: number
  colored: boolean
  onActive: (index: number) => void
  onPick: (row: Row) => void
}) {
  const [place, setPlace] = useState<{
    left: number
    top?: number
    bottom?: number
  } | null>(null)

  // Anchor under the `[[`, flipping above when there is no room; follow scrolling and resizing.
  useLayoutEffect(() => {
    const place = () => {
      const rect = viewRef.current?.coordsAtPos(trigger.from)
      if (!rect) return setPlace(null)
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 8)
      )
      const below = window.innerHeight - rect.bottom
      setPlace(
        below < PICKER_HEIGHT && rect.top > below
          ? { left, bottom: window.innerHeight - rect.top + 6 }
          : { left, top: rect.bottom + 6 }
      )
    }
    place()
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [trigger.from, viewRef])

  if (!place) return null

  const activeRow = rows[Math.min(active, rows.length - 1)]
  const here = rows.filter((r) => r.kind === "node" && r.option.isChild)
  const elsewhere = rows.filter((r) => r.kind === "node" && !r.option.isChild)
  const create = rows.find((r) => r.kind === "create")

  const item = (row: Row) => (
    <CommandItem
      key={rowValue(row)}
      value={rowValue(row)}
      onSelect={() => onPick(row)}
      className="gap-2.5 rounded-xl"
    >
      {row.kind === "create" ? (
        <>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          <span className="truncate">Create branch “{row.name}”</span>
        </>
      ) : (
        <>
          {colored && <StanceDot type={row.option.type} />}
          <span className="truncate">{row.option.label}</span>
        </>
      )}
    </CommandItem>
  )

  return createPortal(
    // Mouse presses must not pull focus out of the editor.
    <div
      onMouseDown={(event) => event.preventDefault()}
      style={{ position: "fixed", ...place, width: PICKER_WIDTH }}
      className="z-50"
    >
      <Command
        shouldFilter={false}
        value={activeRow ? rowValue(activeRow) : ""}
        onValueChange={(value) => {
          const index = rows.findIndex((r) => rowValue(r) === value)
          if (index >= 0) onActive(index)
        }}
        className="h-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10"
      >
        <CommandList role="listbox" aria-label="Tag a thought">
          {rows.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matching thoughts
            </p>
          )}
          {here.length > 0 && (
            <CommandGroup heading="Branches here">
              {here.map((row) => item(row))}
            </CommandGroup>
          )}
          {elsewhere.length > 0 && (
            <CommandGroup
              heading={here.length > 0 ? "Other thoughts" : "Thoughts"}
            >
              {elsewhere.map((row) => item(row))}
            </CommandGroup>
          )}
          {create && <CommandGroup>{item(create)}</CommandGroup>}
        </CommandList>
      </Command>
    </div>,
    document.body
  )
}
