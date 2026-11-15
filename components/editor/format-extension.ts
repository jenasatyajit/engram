import {
  EditorSelection,
  Prec,
  type EditorState,
  type Extension,
  type Range,
  type TransactionSpec,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"

import {
  commonAttrs,
  FORMAT_COLORS,
  formatLine,
  parseLine,
  unitsInRange,
  type Attrs,
  type FormatOp,
} from "@/lib/board/formatting"

/*
 * CodeMirror side of text formatting (see lib/board/formatting.ts for the syntax):
 * styling for the markers, the keyboard shortcuts, and the commands the toolbar calls.
 * Live preview: the markers are hidden, and shown (muted) only while the cursor or selection
 * touches their span, so the text can still be edited. Styling never changes the text itself.
 */

// ---------- Styling ----------

const marks = new Map<string, Decoration>()
const markOf = (cls: string) => {
  let deco = marks.get(cls)
  if (!deco) marks.set(cls, (deco = Decoration.mark({ class: cls })))
  return deco
}

const hidden = Decoration.replace({})

function decorate(view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = []
  const doc = view.state.doc
  // Without focus nothing is being edited, so every marker can be hidden.
  const carets = view.hasFocus ? view.state.selection.ranges : []
  let last = -1
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      pos = line.to + 1
      if (line.from <= last) continue
      last = line.from
      if (!/[*{]/.test(line.text)) continue
      for (const s of parseLine(line.text).spans) {
        const base = line.from
        const touched = carets.some(
          (r) => r.from <= base + s.to && r.to >= base + s.from
        )
        out.push(
          ...(touched
            ? [
                markOf("cm-fmt-marker").range(base + s.from, base + s.openEnd),
                markOf("cm-fmt-marker").range(base + s.closeStart, base + s.to),
              ]
            : [
                hidden.range(base + s.from, base + s.openEnd),
                hidden.range(base + s.closeStart, base + s.to),
              ])
        )
        const cls =
          s.kind === "bold"
            ? "cm-fmt-bold"
            : s.kind === "italic"
              ? "cm-fmt-italic"
              : s.kind === "color"
                ? `cm-fmt-c-${s.name}`
                : `cm-fmt-h-${s.name}`
        out.push(markOf(cls).range(base + s.openEnd, base + s.closeStart))
      }
    }
  }
  return Decoration.set(out, true)
}

const stylePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorate(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged
      )
        this.decorations = decorate(update.view)
    }
  },
  { decorations: (value) => value.decorations }
)

const colorStyles: Record<string, Record<string, string>> = {}
for (const name of FORMAT_COLORS) {
  colorStyles[`.cm-fmt-c-${name}`] = { color: `var(--fmt-text-${name})` }
  colorStyles[`.cm-fmt-h-${name}`] = {
    backgroundColor: `var(--fmt-bg-${name})`,
    borderRadius: "0.25em",
    boxDecorationBreak: "clone",
    padding: "0.04em 0.1em",
  }
}

const styleTheme = EditorView.theme({
  ".cm-fmt-bold": { fontWeight: "700" },
  ".cm-fmt-italic": { fontStyle: "italic" },
  ".cm-fmt-marker": { opacity: "0.4" },
  ...colorStyles,
})

// ---------- Commands ----------

/**
 * The edit for `op` on the main selection, or null when there is nothing to do.
 * Formatting is applied line by line (spans never cross a line break).
 */
export function formatSpec(
  state: EditorState,
  op: FormatOp | { type: "bold" | "italic"; toggle: true }
): TransactionSpec | null {
  const range = state.selection.main
  const doc = state.doc

  if (range.empty) {
    // No selection: open an empty pair to type into.
    if (!("toggle" in op)) return null
    const mark = op.type === "bold" ? "**" : "*"
    return {
      changes: { from: range.head, insert: mark + mark },
      selection: { anchor: range.head + mark.length },
      userEvent: "input.format",
    }
  }

  const first = doc.lineAt(range.from)
  let last = doc.lineAt(range.to)
  // A selection that ends at the very start of a line doesn't include that line.
  if (range.to === last.from && last.number > first.number)
    last = doc.line(last.number - 1)

  const parts: Array<{ from: number; to: number; a: number; b: number }> = []
  for (let n = first.number; n <= last.number; n++) {
    const line = doc.line(n)
    const from = Math.max(range.from, line.from)
    const to = Math.min(range.to, line.to)
    if (to > from)
      parts.push({
        from: line.from,
        to: line.to,
        a: from - line.from,
        b: to - line.from,
      })
  }
  if (parts.length === 0) return null

  // Bold / italic toggle: off only if everything selected already has it.
  let resolved: FormatOp
  if ("toggle" in op) {
    const key = op.type
    const units = parts
      .flatMap((p) => unitsInRange(doc.sliceString(p.from, p.to), p.a, p.b))
      .filter((u) => !/^\s+$/.test(u.text))
    const allOn = units.length > 0 && units.every((u) => u.attrs[key])
    resolved = { type: key, value: !allOn }
  } else resolved = op

  const specs: Array<{ from: number; to: number; insert: string }> = []
  const edits: Array<{ lineFrom: number; start: number; end: number } | null> =
    []
  for (const p of parts) {
    const old = doc.sliceString(p.from, p.to)
    const edit = formatLine(old, p.a, p.b, resolved)
    if (!edit) {
      edits.push(null)
      continue
    }
    edits.push({ lineFrom: p.from, start: edit.start, end: edit.end })
    if (edit.text === old) continue
    // Replace only the part that differs, so tags and the cursor elsewhere are untouched.
    let pre = 0
    while (
      pre < old.length &&
      pre < edit.text.length &&
      old[pre] === edit.text[pre]
    )
      pre++
    let suf = 0
    while (
      suf < old.length - pre &&
      suf < edit.text.length - pre &&
      old[old.length - 1 - suf] === edit.text[edit.text.length - 1 - suf]
    )
      suf++
    specs.push({
      from: p.from + pre,
      to: p.to - suf,
      insert: edit.text.slice(pre, edit.text.length - suf),
    })
  }
  if (specs.length === 0) return null

  const changes = state.changes(specs)
  const firstEdit = edits.find((e) => e)
  const lastEdit = [...edits].reverse().find((e) => e)
  const from = firstEdit
    ? changes.mapPos(firstEdit.lineFrom, -1) + firstEdit.start
    : changes.mapPos(range.from, -1)
  const to = lastEdit
    ? changes.mapPos(lastEdit.lineFrom, -1) + lastEdit.end
    : changes.mapPos(range.to, 1)
  return {
    changes,
    selection: EditorSelection.single(from, to),
    userEvent: "input.format",
  }
}

export function runFormat(
  view: EditorView,
  op: Parameters<typeof formatSpec>[1]
) {
  const spec = formatSpec(view.state, op)
  if (spec) view.dispatch(spec)
  return true
}

/** Formatting of the selected text (for the toolbar's pressed states), or null if none. */
export function selectionFormat(state: EditorState): Attrs | null {
  const range = state.selection.main
  if (range.empty) return null
  const doc = state.doc
  const units = []
  for (
    let n = doc.lineAt(range.from).number;
    n <= doc.lineAt(range.to).number;
    n++
  ) {
    const line = doc.line(n)
    const a = Math.max(range.from, line.from) - line.from
    const b = Math.min(range.to, line.to) - line.from
    if (b > a) units.push(...unitsInRange(line.text, a, b))
  }
  return commonAttrs(units)
}

// ---------- Wiring ----------

export type FormatHost = {
  /** The selection changed. Null when nothing is selected or the editor lost focus. */
  onSelection: (
    selection: { from: number; to: number; format: Attrs | null } | null
  ) => void
}

export function formatExtensions(host: FormatHost): Extension {
  return [
    stylePlugin,
    styleTheme,
    EditorView.updateListener.of((update) => {
      if (!(update.selectionSet || update.docChanged || update.focusChanged))
        return
      const range = update.state.selection.main
      if (range.empty || !update.view.hasFocus) host.onSelection(null)
      else
        host.onSelection({
          from: range.from,
          to: range.to,
          format: selectionFormat(update.state),
        })
    }),
    Prec.high(
      keymap.of([
        {
          key: "Mod-b",
          run: (v) => runFormat(v, { type: "bold", toggle: true }),
        },
        {
          key: "Mod-i",
          run: (v) => runFormat(v, { type: "italic", toggle: true }),
        },
        {
          key: "Mod-Shift-h",
          run: (v) => {
            const on = selectionFormat(v.state)?.highlight === "yellow"
            return runFormat(v, {
              type: "highlight",
              name: on ? null : "yellow",
            })
          },
        },
      ])
    ),
  ]
}
