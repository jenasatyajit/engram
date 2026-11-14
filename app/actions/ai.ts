"use server"

import { generateTitle } from "@/lib/ai/openrouter"
import { titleNode as titleNodeWith } from "@/lib/ai/title-node"
import { dailyCallCap } from "@/lib/ai/usage"
import { runAction } from "@/lib/actions/run"
import { nodeIdInput } from "@/lib/board/inputs"
import { db } from "@/lib/db/client"

/*
 * AI server actions. The browser only calls these while the AI toggle is on
 * (SPEC.md 6.3); every AI call itself goes through lib/ai.
 */

/** Write an AI title for a node from its latest text (SPEC.md D20). */
export async function titleNode(input: unknown) {
  return runAction("ai", nodeIdInput, input, (i) =>
    titleNodeWith(db, i.nodeId, {
      generate: generateTitle,
      dailyCap: dailyCallCap(),
    })
  )
}
