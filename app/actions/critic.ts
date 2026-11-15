"use server"

import { exaSearch, isExaConfigured } from "@/lib/ai/exa"
import { AiError } from "@/lib/ai/errors"
import { fakeAiEnabled, fakeCriticChat, fakeSearch } from "@/lib/ai/fake"
import { isOpenRouterConfigured, openrouterChat } from "@/lib/ai/openrouter"
import { dailyCallCap } from "@/lib/ai/usage"
import { runAction } from "@/lib/actions/run"
import { boardIdInput } from "@/lib/board/inputs"
import { findingIdInput, reviewBoardInput } from "@/lib/critic/inputs"
import * as criticRepo from "@/lib/critic/repo"
import { reviewBoard as runReview, type ReviewDeps } from "@/lib/critic/review"
import { db } from "@/lib/db/client"

/*
 * Critic server actions (SPEC.md 6.2, D24). The browser only asks for a review
 * in Critic mode with the AI toggle on; every AI call goes through lib/ai.
 */

function reviewDeps(): ReviewDeps {
  const dailyCap = dailyCallCap()
  if (fakeAiEnabled())
    return { chat: fakeCriticChat, search: fakeSearch, dailyCap }
  if (!isOpenRouterConfigured()) {
    throw new AiError(
      "AI_NOT_CONFIGURED",
      "Critic reviews need an OpenRouter key: add OPENROUTER_API_KEY to .env.local and restart."
    )
  }
  return {
    chat: openrouterChat,
    search: isExaConfigured() ? exaSearch : null,
    dailyCap,
  }
}

/** Review the whole board (called after a leave event). Skipped when nothing changed. */
export async function reviewBoard(input: unknown) {
  return runAction("critic", reviewBoardInput, input, (i) =>
    runReview(
      db,
      { boardId: i.boardId, focusNodeId: i.focusNodeId ?? null },
      reviewDeps()
    )
  )
}

/** Pending findings for the board (no AI call). */
export async function listFindings(input: unknown) {
  return runAction("critic", boardIdInput, input, (i) =>
    criticRepo.listFindings(db, i.boardId)
  )
}

export async function acceptFinding(input: unknown) {
  return runAction("critic", findingIdInput, input, (i) =>
    criticRepo.acceptFinding(db, i.findingId)
  )
}

export async function dismissFinding(input: unknown) {
  return runAction("critic", findingIdInput, input, (i) =>
    criticRepo.dismissFinding(db, i.findingId)
  )
}
