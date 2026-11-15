import { MENTION_PATTERN, mentionsToPlain } from "./mentions"

/*
 * Inline text formatting, stored as markers in the plain text:
 *   **bold**   *italic*   {c:red|coloured text}   {h:yellow|highlighted text}
 * Spans never cross a line break. The editor styles them; everywhere else strips them
 * (`plainText`). This file is pure, so the parsing and the editing rules are unit-tested.
 *
 * Editing works on "units" (one per character, or one per `[[Title|id]]` tag) carrying
 * their attributes, then writes the line back with canonical, properly nested markers.
 * Every rewrite is re-parsed and compared with what was intended, so a formatting command
 * can never silently corrupt text.
 */

export const FORMAT_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "gray",
] as const
export type FormatColor = (typeof FORMAT_COLORS)[number]

const isColor = (name: string): name is FormatColor =>
  (FORMAT_COLORS as readonly string[]).includes(name)

export type Attrs = {
  bold: boolean
  italic: boolean
  color: FormatColor | null
  highlight: FormatColor | null
}

export const NO_ATTRS: Attrs = {
  bold: false,
  italic: false,
  color: null,
  highlight: null,
}

export type SpanKind = "bold" | "italic" | "color" | "highlight"

/** A matched pair of markers. Offsets are within the line. */
export type Span = {
  kind: SpanKind
  name: FormatColor | null
  /** Start of the opening marker. */
  from: number
  /** End of the opening marker = start of the content. */
  openEnd: number
  /** Start of the closing marker = end of the content. */
  closeStart: number
  /** End of the closing marker. */
  to: number
}

/** One character (or one whole `[[Title|id]]` tag) of the visible text, with its formatting. */
export type Unit = { from: number; to: number; text: string; attrs: Attrs }

type OpenSpan = {
  kind: SpanKind
  name: FormatColor | null
  from: number
  openEnd: number
}

const BRACE_OPEN = /\{([ch]):([a-z]+)\|/y
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)
const isBrace = (kind: SpanKind) => kind === "color" || kind === "highlight"

export function parseLine(line: string): { spans: Span[]; units: Unit[] } {
  const spans: Span[] = []
  const stack: OpenSpan[] = []
  const pill = new RegExp(MENTION_PATTERN, "y")
  const has = (kind: SpanKind) => stack.some((s) => s.kind === kind)

  /** Close the innermost span; an empty one is left as literal text. */
  const close = (at: number, length: number) => {
    const open = stack.pop()!
    if (at > open.openEnd) {
      spans.push({
        kind: open.kind,
        name: open.name,
        from: open.from,
        openEnd: open.openEnd,
        closeStart: at,
        to: at + length,
      })
    }
  }

  let i = 0
  while (i < line.length) {
    const ch = line[i]

    if (ch === "[") {
      pill.lastIndex = i
      const m = pill.exec(line)
      i += m ? m[0].length : 1
      continue
    }

    if (ch === "*") {
      let n = 1
      while (line[i + n] === "*") n++
      const canClose = !isSpace(line[i - 1])
      const canOpen = !isSpace(line[i + n])
      let pos = i
      let left = n
      if (canClose) {
        while (left > 0 && stack.length > 0) {
          const top = stack[stack.length - 1]
          if (top.kind === "italic") {
            close(pos, 1)
            pos += 1
            left -= 1
          } else if (top.kind === "bold" && left >= 2) {
            close(pos, 2)
            pos += 2
            left -= 2
          } else break
        }
      }
      if (canOpen) {
        while (left > 0) {
          if (left >= 2 && !has("bold")) {
            stack.push({
              kind: "bold",
              name: null,
              from: pos,
              openEnd: pos + 2,
            })
            pos += 2
            left -= 2
          } else if (!has("italic")) {
            stack.push({
              kind: "italic",
              name: null,
              from: pos,
              openEnd: pos + 1,
            })
            pos += 1
            left -= 1
          } else break
        }
      }
      i += n
      continue
    }

    if (ch === "{") {
      BRACE_OPEN.lastIndex = i
      const m = BRACE_OPEN.exec(line)
      if (m && isColor(m[2])) {
        const kind: SpanKind = m[1] === "c" ? "color" : "highlight"
        if (!has(kind)) {
          stack.push({
            kind,
            name: m[2],
            from: i,
            openEnd: i + m[0].length,
          })
          i += m[0].length
          continue
        }
      }
      i++
      continue
    }

    if (ch === "}") {
      const top = stack[stack.length - 1]
      if (top && isBrace(top.kind)) close(i, 1)
      i++
      continue
    }

    i++
  }

  spans.sort((a, b) => a.from - b.from)
  return { spans, units: unitsOf(line, spans) }
}

function unitsOf(line: string, spans: Span[]): Unit[] {
  const hidden = new Uint8Array(line.length)
  for (const s of spans) {
    hidden.fill(1, s.from, s.openEnd)
    hidden.fill(1, s.closeStart, s.to)
  }
  const pill = new RegExp(MENTION_PATTERN, "y")
  const units: Unit[] = []
  let i = 0
  while (i < line.length) {
    if (hidden[i]) {
      i++
      continue
    }
    let end = i + 1
    if (line[i] === "[") {
      pill.lastIndex = i
      const m = pill.exec(line)
      if (m) end = i + m[0].length
    } else if (
      line.charCodeAt(i) >= 0xd800 &&
      line.charCodeAt(i) <= 0xdbff &&
      i + 1 < line.length
    ) {
      end = i + 2
    }
    const attrs: Attrs = { ...NO_ATTRS }
    for (const s of spans) {
      if (s.openEnd <= i && end <= s.closeStart) {
        if (s.kind === "bold") attrs.bold = true
        else if (s.kind === "italic") attrs.italic = true
        else if (s.kind === "color") attrs.color = s.name
        else attrs.highlight = s.name
      }
    }
    units.push({ from: i, to: end, text: line.slice(i, end), attrs })
    i = end
  }
  return units
}

// ---------- Writing markers back ----------

type Layer = { key: "highlight" | "color" | "bold" | "italic"; value: string }

function layersOf(a: Attrs): Layer[] {
  const layers: Layer[] = []
  if (a.highlight) layers.push({ key: "highlight", value: a.highlight })
  if (a.color) layers.push({ key: "color", value: a.color })
  if (a.bold) layers.push({ key: "bold", value: "" })
  if (a.italic) layers.push({ key: "italic", value: "" })
  return layers
}

const openOf = (l: Layer) =>
  l.key === "highlight"
    ? `{h:${l.value}|`
    : l.key === "color"
      ? `{c:${l.value}|`
      : l.key === "bold"
        ? "**"
        : "*"
const closeOf = (l: Layer) =>
  l.key === "highlight" || l.key === "color"
    ? "}"
    : l.key === "bold"
      ? "**"
      : "*"

/**
 * Bold and italic markers can't touch whitespace (`** x**` is not bold), so drop those
 * attributes from whitespace at the edge of a bold/italic run.
 */
function trimStarEdges(units: Unit[]): Unit[] {
  const out = units.map((u) => ({ ...u, attrs: { ...u.attrs } }))
  for (const key of ["bold", "italic"] as const) {
    let i = 0
    while (i < out.length) {
      if (!out[i].attrs[key]) {
        i++
        continue
      }
      let j = i
      while (j < out.length && out[j].attrs[key]) j++
      let a = i
      let b = j - 1
      while (a <= b && /^\s+$/.test(out[a].text)) out[a++].attrs[key] = false
      while (b >= a && /^\s+$/.test(out[b].text)) out[b--].attrs[key] = false
      i = j
    }
  }
  return out
}

/** Text for the units with nested markers, and where each unit starts and ends in it. */
export function serializeUnits(units: Unit[]) {
  let text = ""
  let current: Layer[] = []
  const starts: number[] = []
  const ends: number[] = []
  for (const unit of units) {
    const target = layersOf(unit.attrs)
    let keep = 0
    while (
      keep < current.length &&
      keep < target.length &&
      current[keep].key === target[keep].key &&
      current[keep].value === target[keep].value
    )
      keep++
    for (let k = current.length - 1; k >= keep; k--) text += closeOf(current[k])
    for (let k = keep; k < target.length; k++) text += openOf(target[k])
    current = target
    starts.push(text.length)
    text += unit.text
    ends.push(text.length)
  }
  for (let k = current.length - 1; k >= 0; k--) text += closeOf(current[k])
  return { text, starts, ends }
}

// ---------- Editing ----------

export type FormatOp =
  /** `value` omitted = decided by the caller from the whole selection. */
  | { type: "bold" | "italic"; value: boolean }
  | { type: "color" | "highlight"; name: FormatColor | null }
  | { type: "clear"; scope: "all" | "colors" }

export type LineEdit = {
  /** The line's new text. */
  text: string
  /** Where the formatted selection starts and ends in the new text. */
  start: number
  end: number
}

/** The units that lie fully inside `[a, b)` of the line. */
export function unitsInRange(line: string, a: number, b: number) {
  return parseLine(line).units.filter((u) => u.from >= a && u.to <= b)
}

const sameAttrs = (x: Attrs, y: Attrs) =>
  x.bold === y.bold &&
  x.italic === y.italic &&
  x.color === y.color &&
  x.highlight === y.highlight

/**
 * Apply `op` to `[a, b)` of one line. Returns null when there is nothing to format, or when
 * the rewrite could not be verified (the caller then leaves the text alone).
 */
export function formatLine(
  line: string,
  a: number,
  b: number,
  op: FormatOp
): LineEdit | null {
  const { units } = parseLine(line)
  const picked: number[] = []
  units.forEach((u, i) => {
    if (u.from >= a && u.to <= b) picked.push(i)
  })
  if (picked.length === 0) return null

  const next = units.map((u) => ({ ...u, attrs: { ...u.attrs } }))
  for (const i of picked) {
    const attrs = next[i].attrs
    if (op.type === "bold" || op.type === "italic") attrs[op.type] = op.value
    else if (op.type === "color") attrs.color = op.name
    else if (op.type === "highlight") attrs.highlight = op.name
    else if (op.type === "clear") {
      attrs.color = null
      attrs.highlight = null
      if (op.scope === "all") {
        attrs.bold = false
        attrs.italic = false
      }
    }
  }

  const expected = trimStarEdges(next)
  const out = serializeUnits(expected)

  // Verify: the new text must parse back to exactly the intended text and formatting.
  const again = parseLine(out.text).units
  const ok =
    again.length === expected.length &&
    again.every(
      (u, i) =>
        u.text === expected[i].text && sameAttrs(u.attrs, expected[i].attrs)
    )
  if (!ok) return null

  return {
    text: out.text,
    start: out.starts[picked[0]],
    end: out.ends[picked[picked.length - 1]],
  }
}

/** Formatting shared by every non-blank unit of a selection (for toolbar highlights). */
export function commonAttrs(units: Unit[]): Attrs | null {
  const real = units.filter((u) => !/^\s+$/.test(u.text))
  if (real.length === 0) return null
  const first = real[0].attrs
  return {
    bold: real.every((u) => u.attrs.bold),
    italic: real.every((u) => u.attrs.italic),
    color: real.every((u) => u.attrs.color === first.color)
      ? first.color
      : null,
    highlight: real.every((u) => u.attrs.highlight === first.highlight)
      ? first.highlight
      : null,
  }
}

// ---------- Plain text ----------

/** The text without formatting markers (tags stay as they are). */
export function stripFormatting(text: string) {
  if (!/[*{]/.test(text)) return text
  return text
    .split("\n")
    .map((line) =>
      parseLine(line)
        .units.map((u) => u.text)
        .join("")
    )
    .join("\n")
}

/**
 * Readable text for places that show a thought outside the editor (labels, tooltips, AI
 * prompts): no formatting markers, and `[[Title|id]]` as `[[Title]]`.
 */
export function plainText(
  text: string,
  titleOf?: (id: string) => string | undefined
) {
  return mentionsToPlain(stripFormatting(text), titleOf)
}
