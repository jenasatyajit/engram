import {
  Annotation,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  keymap,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"

import { stanceOf } from "@/lib/critic/stance"
import {
  detectTrigger,
  formatMention,
  MENTION_PATTERN,
  type MentionTrigger,
} from "@/lib/board/mentions"
import type { NodeType } from "@/lib/db/schema"

/*
 * CodeMirror extensions for `[[` tags (kept free of React so they stay small and testable):
 * - pills: `[[Title|id]]` is drawn as one atomic pill (replace decoration + atomicRanges),
 *   built by a ViewPlugin because it only ever replaces text inside a line (CodeMirror docs).
 * - auto-close: the second `[` makes `[[]]` with the cursor in the middle.
 * - picker trigger: a StateField derived purely from the document and cursor, so it can
 *   never drift out of sync; the React picker only renders it.
 * The document stays a plain string, which is what drafts, versions and the Critic read.
 */

export type MentionInfo = {
  title: string
  type: NodeType | null
  /** The node is gone (deleted or from another board). */
  missing: boolean
}

export type MentionHost = {
  resolve: (id: string, fallbackTitle: string) => MentionInfo
  /** Critic mode: pills are coloured by stance. */
  colored: () => boolean
  open: (id: string) => void
  onTrigger: (trigger: MentionTrigger | null) => void
  /** Picker keys. Return true when the key was used. */
  key: (key: "down" | "up" | "select") => boolean
}

/** Marks changes that came from the store (not the owner typing), so they aren't echoed back. */
export const ExternalChange = Annotation.define<boolean>()

/** Redraw every pill (a node was renamed or deleted, or the mode changed). */
export const refreshMentions = StateEffect.define<null>()

const dismissPicker = StateEffect.define<number>()

// ---------- Pills ----------

const PILL_BASE =
  "cm-mention mx-px inline-flex max-w-[28ch] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 align-baseline font-sans text-[0.72em] leading-[1.6] font-medium whitespace-nowrap select-none transition-colors"

const PILL_STYLES = {
  neutral: "border-border bg-muted text-foreground hover:bg-accent",
  for: "border-stance-for/40 bg-stance-for/15 text-foreground hover:bg-stance-for/25",
  against:
    "border-stance-against/40 bg-stance-against/15 text-foreground hover:bg-stance-against/25",
  verdict:
    "border-stance-verdict/40 bg-stance-verdict/15 text-foreground hover:bg-stance-verdict/25",
  missing:
    "border-dashed border-border bg-transparent text-muted-foreground line-through",
} as const

const DOT_STYLES = {
  for: "bg-stance-for",
  against: "bg-stance-against",
  verdict: "bg-stance-verdict",
} as const

function pillKind(info: MentionInfo, colored: boolean) {
  if (info.missing) return "missing"
  if (!colored) return "neutral"
  const stance = stanceOf(info.type)
  if (stance) return stance
  return info.type === "verdict" ? "verdict" : "neutral"
}

class MentionWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly info: MentionInfo,
    readonly colored: boolean,
    readonly host: MentionHost
  ) {
    super()
  }

  eq(other: MentionWidget) {
    return (
      other.id === this.id &&
      other.colored === this.colored &&
      other.info.title === this.info.title &&
      other.info.type === this.info.type &&
      other.info.missing === this.info.missing
    )
  }

  toDOM() {
    const kind = pillKind(this.info, this.colored)
    const el = document.createElement("span")
    el.className = `${PILL_BASE} ${PILL_STYLES[kind]}`
    el.dataset.mentionId = this.id
    if (!this.info.missing) el.setAttribute("role", "link")
    el.title = this.info.missing
      ? "This thought no longer exists"
      : `Open "${this.info.title}"`

    if (kind === "for" || kind === "against" || kind === "verdict") {
      const dot = document.createElement("span")
      dot.className = `size-1.5 shrink-0 rounded-full ${DOT_STYLES[kind]}`
      el.append(dot)
    }
    const label = document.createElement("span")
    label.className = "truncate"
    label.textContent = this.info.title
    el.append(label)

    el.addEventListener("click", (event) => {
      event.preventDefault()
      if (!this.info.missing) this.host.open(this.id)
    })
    return el
  }

  // The widget handles its own clicks; the editor must not move the cursor into it.
  ignoreEvent() {
    return true
  }
}

function pills(host: MentionHost): Extension {
  const matcher = new MatchDecorator({
    regexp: new RegExp(MENTION_PATTERN, "g"),
    decoration: (match) => {
      const id = match[2].toLowerCase()
      return Decoration.replace({
        widget: new MentionWidget(
          id,
          host.resolve(id, match[1]),
          host.colored(),
          host
        ),
      })
    },
  })

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view)
      }
      update(update: ViewUpdate) {
        const refresh = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshMentions))
        )
        this.decorations = refresh
          ? matcher.createDeco(update.view)
          : matcher.updateDeco(update, this.decorations)
      }
    },
    {
      decorations: (value) => value.decorations,
      // Cursor motion and Backspace treat each pill as one character.
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.decorations ?? Decoration.none
        ),
    }
  )
}

// ---------- Picker trigger ----------

type TriggerState = {
  trigger: MentionTrigger | null
  dismissedAt: number | null
}

const sameTrigger = (a: MentionTrigger | null, b: MentionTrigger | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.from === b.from &&
    a.to === b.to &&
    a.query === b.query)

export const triggerField = StateField.define<TriggerState>({
  create: () => ({ trigger: null, dismissedAt: null }),
  update(value, tr) {
    let dismissedAt = value.dismissedAt
    if (dismissedAt !== null && tr.docChanged)
      dismissedAt = tr.changes.mapPos(dismissedAt, -1)
    for (const effect of tr.effects)
      if (effect.is(dismissPicker)) dismissedAt = effect.value
    if (!tr.docChanged && !tr.selection && dismissedAt === value.dismissedAt)
      return value

    const sel = tr.state.selection.main
    let trigger: MentionTrigger | null = null
    if (sel.empty) {
      const line = tr.state.doc.lineAt(sel.head)
      trigger = detectTrigger(line.text, sel.head - line.from, line.from)
    }
    // Esc closes the picker until this `[[` is left or retyped.
    if (trigger && trigger.from === dismissedAt) trigger = null
    else if (!trigger) dismissedAt = null

    return sameTrigger(trigger, value.trigger) &&
      dismissedAt === value.dismissedAt
      ? value
      : { trigger, dismissedAt }
  },
})

export function currentTrigger(view: EditorView) {
  return view.state.field(triggerField).trigger
}

/** Replace the open `[[query` with a finished tag and put the cursor after it. */
export function insertMention(
  view: EditorView,
  trigger: MentionTrigger,
  title: string,
  id: string
) {
  const token = formatMention(title, id)
  view.dispatch({
    changes: { from: trigger.from, to: trigger.to, insert: token },
    selection: { anchor: trigger.from + token.length },
    userEvent: "input.complete",
  })
  view.focus()
}

/** Insert a finished tag at the cursor (when the open `[[` was lost while waiting). */
export function insertMentionAtCursor(
  view: EditorView,
  title: string,
  id: string
) {
  const head = view.state.selection.main.head
  const token = formatMention(title, id)
  view.dispatch({
    changes: { from: head, insert: token },
    selection: { anchor: head + token.length },
    userEvent: "input.complete",
  })
  view.focus()
}

function picker(host: MentionHost): Extension {
  const open = (view: EditorView) => currentTrigger(view) !== null

  return [
    triggerField,
    EditorView.updateListener.of((update) => {
      const before = update.startState.field(triggerField).trigger
      const after = update.state.field(triggerField).trigger
      if (!sameTrigger(before, after)) host.onTrigger(after)
    }),

    // Auto-close and bracket editing run before the default input handling.
    Prec.high(
      EditorView.inputHandler.of((view, from, to, text) => {
        if (from !== to) return false
        const state = view.state
        // Second `[` of `[[` -> `[[]]`, cursor in the middle.
        if (
          text === "[" &&
          state.sliceDoc(from - 1, from) === "[" &&
          state.sliceDoc(Math.max(0, from - 2), from - 1) !== "[" &&
          state.sliceDoc(from, from + 2) !== "]]"
        ) {
          view.dispatch({
            changes: { from, insert: "[]]" },
            selection: { anchor: from + 1 },
            userEvent: "input.type",
          })
          return true
        }
        // Typing `]` in front of the auto-closed `]]` steps over it.
        if (
          text === "]" &&
          state.sliceDoc(from, from + 1) === "]" &&
          open(view)
        ) {
          view.dispatch({ selection: { anchor: from + 1 } })
          return true
        }
        return false
      })
    ),

    Prec.highest(
      keymap.of([
        { key: "ArrowDown", run: (v) => open(v) && host.key("down") },
        { key: "ArrowUp", run: (v) => open(v) && host.key("up") },
        { key: "Enter", run: (v) => open(v) && host.key("select") },
        { key: "Tab", run: (v) => open(v) && host.key("select") },
        {
          key: "Escape",
          run: (view) => {
            const trigger = currentTrigger(view)
            if (!trigger) return false
            view.dispatch({ effects: dismissPicker.of(trigger.from) })
            return true
          },
        },
        {
          // Backspace inside an empty `[[]]` removes both pairs.
          key: "Backspace",
          run: (view) => {
            const sel = view.state.selection.main
            if (!sel.empty) return false
            const { head } = sel
            if (
              view.state.sliceDoc(head - 2, head) === "[[" &&
              view.state.sliceDoc(head, head + 2) === "]]"
            ) {
              view.dispatch({
                changes: { from: head - 2, to: head + 2 },
                userEvent: "delete.backward",
              })
              return true
            }
            return false
          },
        },
      ])
    ),
  ]
}

/** Everything `[[` related: pills, auto-close, and the picker trigger. */
export function mentionExtensions(host: MentionHost): Extension {
  return [pills(host), picker(host)]
}

/** Reject edits that would push the text past `max` characters (the textarea's `maxLength`). */
export function maxLength(max: number): Extension {
  return EditorState.transactionFilter.of((tr) =>
    tr.docChanged && tr.newDoc.length > max ? [] : tr
  )
}
