import type { NodeType } from "@/lib/db/schema"

/*
 * Inline tags in a thought's text: `[[Title|node-id]]`.
 * The id is what the tag points at; the title is only a fallback shown if that node is gone,
 * so renaming (or an AI retitle) never breaks a tag. The editor draws the token as a pill.
 * Pure helpers, shared by the editor, the Critic context and the title writer.
 */

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

/** Source of the token pattern; build a fresh RegExp per use (it is global, so it has state). */
export const MENTION_PATTERN = `\\[\\[([^\\[\\]|\\n]*)\\|(${UUID})\\]\\]`

export type Mention = { from: number; to: number; title: string; id: string }

/** Titles live inside the token, so they can't contain its delimiters. */
function cleanTitle(title: string) {
  return title
    .replace(/[[\]|\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function formatMention(title: string, id: string) {
  return `[[${cleanTitle(title)}|${id}]]`
}

export function findMentions(text: string): Mention[] {
  const out: Mention[] = []
  for (const m of text.matchAll(new RegExp(MENTION_PATTERN, "g"))) {
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      title: m[1],
      id: m[2].toLowerCase(),
    })
  }
  return out
}

/**
 * Readable text for places that don't draw pills (history, AI prompts, labels):
 * `[[Title|id]]` becomes `[[Title]]`. `titleOf` can supply the node's current title.
 */
export function mentionsToPlain(
  text: string,
  titleOf?: (id: string) => string | undefined
) {
  return text.replace(
    new RegExp(MENTION_PATTERN, "g"),
    (_all, title: string, id: string) =>
      `[[${titleOf?.(id.toLowerCase()) ?? title}]]`
  )
}

// ---------- The `[[` picker trigger ----------

export type MentionTrigger = {
  /** Start of the `[[`. */
  from: number
  /** End of what the pick replaces: the cursor, plus an auto-closed `]]` right after it. */
  to: number
  /** What has been typed after `[[`. */
  query: string
}

const MAX_QUERY = 80

/**
 * Is the cursor inside an open `[[query`? `line` is the text of the cursor's line and `offset`
 * the cursor's position in it; `lineStart` turns the result into document positions.
 */
export function detectTrigger(
  line: string,
  offset: number,
  lineStart: number
): MentionTrigger | null {
  const before = line.slice(0, offset)
  const open = before.lastIndexOf("[[")
  if (open < 0) return null
  const query = before.slice(open + 2)
  if (query.length > MAX_QUERY || /[[\]|]/.test(query)) return null
  const closes = line.slice(offset, offset + 2) === "]]" ? 2 : 0
  return {
    from: lineStart + open,
    to: lineStart + offset + closes,
    query,
  }
}

// ---------- Picker options ----------

export type MentionCandidate = {
  id: string
  title: string | null
  text: string
  type: NodeType | null
  parentId: string | null
  createdAt: Date
}

export type MentionOption = {
  id: string
  label: string
  type: MentionCandidate["type"]
  /** A branch of the thought being edited (listed first). */
  isChild: boolean
}

const MAX_OPTIONS = 50

/**
 * Thoughts that match the query: the current thought's own branches first, then the rest;
 * prefix matches before substring matches. The thought being edited is never offered.
 */
export function mentionOptions(
  nodes: MentionCandidate[],
  query: string,
  currentId: string | null,
  labelOf: (node: MentionCandidate) => string
): MentionOption[] {
  const q = query.trim().toLowerCase()
  const ranked: Array<MentionOption & { rank: number; at: number }> = []
  for (const node of nodes) {
    if (node.id === currentId) continue
    const label = labelOf(node)
    const lower = label.toLowerCase()
    const idx = q ? lower.indexOf(q) : 0
    if (idx < 0) continue
    ranked.push({
      id: node.id,
      label,
      type: node.type,
      isChild: currentId !== null && node.parentId === currentId,
      rank: idx === 0 ? 0 : 1,
      at: +node.createdAt,
    })
  }
  ranked.sort(
    (a, b) =>
      Number(b.isChild) - Number(a.isChild) || a.rank - b.rank || a.at - b.at
  )
  return ranked.slice(0, MAX_OPTIONS).map((o) => ({
    id: o.id,
    label: o.label,
    type: o.type,
    isChild: o.isChild,
  }))
}

/** Can "Create branch" be offered for this query? Not for empty text or an exact existing title. */
export function canCreateMention(options: MentionOption[], query: string) {
  const q = query.trim().toLowerCase()
  return q.length > 0 && !options.some((o) => o.label.toLowerCase() === q)
}
