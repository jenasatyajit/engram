import { applyAiTitle, latestVersion } from "@/lib/board/repo"
import type { Db } from "@/lib/db/types"

import { AiError } from "./errors"
import { reserveAiCall } from "./usage"

export type TitleResult =
  /** The new title was saved. */
  | { status: "applied"; title: string }
  /** Nothing to do: the latest version already has its AI title. */
  | { status: "unchanged" }
  /** The note changed while the AI was writing, so this title was dropped. */
  | { status: "stale" }
  /** Too little text to name, or the node is gone. */
  | { status: "skipped" }

export type TitleDeps = {
  /** Writes a title for the note text (the OpenRouter call in production). */
  generate: (text: string) => Promise<string>
  dailyCap: number
}

/** Give a node an AI title from its latest version (SPEC.md D20). */
export async function titleNode(
  db: Db,
  nodeId: string,
  { generate, dailyCap }: TitleDeps
): Promise<TitleResult> {
  const latest = await latestVersion(db, nodeId)
  if (!latest) return { status: "skipped" }
  if (latest.titledVersionId === latest.id) return { status: "unchanged" }
  if (latest.text.trim().length < 3) return { status: "skipped" }

  if (!(await reserveAiCall(db, dailyCap))) {
    throw new AiError(
      "DAILY_CAP",
      "Today's AI limit is reached, so new titles are paused until tomorrow."
    )
  }

  const title = await generate(latest.text)
  const applied = await applyAiTitle(db, nodeId, latest.id, title)
  return applied ? { status: "applied", title } : { status: "stale" }
}
