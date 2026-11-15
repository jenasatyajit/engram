/*
 * Line and word diffs for the version history. Pure, so it is unit-tested.
 * Lines are matched with a longest-common-subsequence; inside a changed pair of lines,
 * words are matched the same way so only the words that changed are highlighted.
 */

export type Segment = { text: string; changed: boolean }

export type DiffLine = {
  kind: "same" | "add" | "del"
  text: string
  /** For a changed line paired with its other half: which words changed. */
  segments?: Segment[]
}

export type DiffGap = { kind: "gap"; count: number }

/** The LCS table is n*m cells; beyond this, treat the middle as fully replaced. */
const MAX_CELLS = 2_000_000

type Op = { op: "same" | "del" | "add"; a: number; b: number }

/** Edit script turning `a` into `b`. */
function diffSeq(a: string[], b: string[]): Op[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const ops: Op[] = []
  for (let i = 0; i < start; i++) ops.push({ op: "same", a: i, b: i })

  const n = endA - start
  const m = endB - start
  const matches: Array<[number, number]> = []
  if (n > 0 && m > 0 && n * m <= MAX_CELLS) {
    const w = m + 1
    const table = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] =
          a[start + i] === b[start + j]
            ? table[(i + 1) * w + j + 1] + 1
            : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        matches.push([start + i, start + j])
        i++
        j++
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i++
      else j++
    }
  }

  let ai = start
  let bi = start
  for (const [ma, mb] of matches) {
    while (ai < ma) ops.push({ op: "del", a: ai++, b: -1 })
    while (bi < mb) ops.push({ op: "add", a: -1, b: bi++ })
    ops.push({ op: "same", a: ai++, b: bi++ })
  }
  while (ai < endA) ops.push({ op: "del", a: ai++, b: -1 })
  while (bi < endB) ops.push({ op: "add", a: -1, b: bi++ })

  for (let k = 0; endA + k < a.length; k++)
    ops.push({ op: "same", a: endA + k, b: endB + k })
  return ops
}

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu

function pushSegment(out: Segment[], text: string, changed: boolean) {
  const last = out[out.length - 1]
  if (last && last.changed === changed) last.text += text
  else out.push({ text, changed })
}

/**
 * Word-level highlight for a replaced line. Null when the two lines share too little for
 * a word diff to help (the whole line is then simply shown as removed and added).
 */
export function wordDiff(
  before: string,
  after: string
): { before: Segment[]; after: Segment[] } | null {
  const a = before.match(TOKEN) ?? []
  const b = after.match(TOKEN) ?? []
  const ops = diffSeq(a, b)

  const real = (t: string) => !/^\s+$/.test(t)
  const shared = ops.filter((o) => o.op === "same" && real(a[o.a])).length
  const most = Math.max(a.filter(real).length, b.filter(real).length)
  if (most === 0 || shared / most < 0.4) return null

  const left: Segment[] = []
  const right: Segment[] = []
  for (const o of ops) {
    if (o.op === "same") {
      pushSegment(left, a[o.a], false)
      pushSegment(right, b[o.b], false)
    } else if (o.op === "del") pushSegment(left, a[o.a], true)
    else pushSegment(right, b[o.b], true)
  }
  return { before: left, after: right }
}

/**
 * Lines that changed from `before` to `after`. `before` null = a first version (all added).
 * Within a changed block, removed lines come first, then added lines; lines are paired
 * in order so their words can be compared.
 */
export function diffLines(before: string | null, after: string): DiffLine[] {
  const newLines = after.split("\n")
  if (before === null) return newLines.map((text) => ({ kind: "add", text }))

  const oldLines = before.split("\n")
  const ops = diffSeq(oldLines, newLines)
  const out: DiffLine[] = []

  let i = 0
  while (i < ops.length) {
    if (ops[i].op === "same") {
      out.push({ kind: "same", text: oldLines[ops[i].a] })
      i++
      continue
    }
    const dels: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < ops.length && ops[i].op !== "same") {
      if (ops[i].op === "del")
        dels.push({ kind: "del", text: oldLines[ops[i].a] })
      else adds.push({ kind: "add", text: newLines[ops[i].b] })
      i++
    }
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const words = wordDiff(dels[k].text, adds[k].text)
      if (words) {
        dels[k].segments = words.before
        adds[k].segments = words.after
      }
    }
    out.push(...dels, ...adds)
  }
  return out
}

/** Keep changed lines and `context` unchanged lines around them; fold the rest into gaps. */
export function collapseContext(
  lines: DiffLine[],
  context = 1
): Array<DiffLine | DiffGap> {
  const keep = new Uint8Array(lines.length)
  lines.forEach((line, i) => {
    if (line.kind === "same") return
    for (
      let k = Math.max(0, i - context);
      k <= Math.min(lines.length - 1, i + context);
      k++
    )
      keep[k] = 1
  })
  const out: Array<DiffLine | DiffGap> = []
  let skipped = 0
  lines.forEach((line, i) => {
    if (keep[i]) {
      if (skipped) out.push({ kind: "gap", count: skipped })
      skipped = 0
      out.push(line)
    } else skipped++
  })
  if (skipped) out.push({ kind: "gap", count: skipped })
  return out
}
