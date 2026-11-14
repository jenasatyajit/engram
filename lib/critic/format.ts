import { cleanTitle } from "@/lib/ai/titles"
import { snippet } from "@/lib/board/labels"
import type { ArgumentProposal } from "@/lib/db/schema"

/** Label for AI arguments that have no web source (SPEC.md principle 6). */
export const NO_SOURCE_LABEL = "AI knowledge, no source"

/**
 * Plain text of an accepted AI argument. Sources (or the no-source label) go in
 * the text itself, so they stay in the node's version history.
 */
export function argumentNodeText(argument: ArgumentProposal) {
  const body = argument.text.trim()
  if (argument.sources.length === 0) return `${body}\n\n(${NO_SOURCE_LABEL})`
  const lines = argument.sources.map((s) => `- ${s.title}: ${s.url}`)
  return `${body}\n\nSources:\n${lines.join("\n")}`
}

/** A tidy 2–6 word title for an AI argument; falls back to the first words of its text. */
export function argumentTitle(raw: string, text: string) {
  const cleaned = cleanTitle(raw).slice(0, 60).trim()
  return cleaned || snippet(text, 40)
}
