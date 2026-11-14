import "server-only"

import { AiError } from "./errors"
import {
  parseTitleResponse,
  SET_TITLE_TOOL,
  TITLE_SYSTEM_PROMPT,
  titleUserPrompt,
} from "./titles"

/*
 * OpenRouter client: the single place Engram talks to OpenRouter (SPEC.md 7.1, D21).
 * Server-only; the key never reaches the browser.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
export const DEFAULT_TITLE_MODEL = "inclusionai/ling-3.1-flash"
const TIMEOUT_MS = 20_000

export function titleModel(env = process.env) {
  return env.OPENROUTER_TITLE_MODEL?.trim() || DEFAULT_TITLE_MODEL
}

export function isOpenRouterConfigured(env = process.env) {
  return Boolean(env.OPENROUTER_API_KEY?.trim())
}

/** Ask the title model for a 2–4 word title. Throws AiError on any failure. */
export async function generateTitle(noteText: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new AiError(
      "AI_NOT_CONFIGURED",
      "AI titles need an OpenRouter key: add OPENROUTER_API_KEY to .env.local and restart."
    )
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Engram",
      },
      body: JSON.stringify({
        model: titleModel(),
        messages: [
          { role: "system", content: TITLE_SYSTEM_PROMPT },
          { role: "user", content: titleUserPrompt(noteText) },
        ],
        // This model has no JSON-schema mode on OpenRouter, so force a tool call instead.
        tools: [SET_TITLE_TOOL],
        tool_choice: { type: "function", function: { name: "set_title" } },
        // Hybrid reasoning model: a title needs no thinking. Keep the output small (7.2).
        reasoning: { enabled: false },
        max_tokens: 100,
        temperature: 0.2,
        // Only route to providers that honour tools and the other parameters.
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    throw new AiError(
      "AI_FAILED",
      timedOut
        ? "The AI took too long to name this note."
        : "Couldn't reach the AI service."
    )
  }

  if (!response.ok) {
    const detail = await safeErrorMessage(response)
    console.error("[openrouter]", response.status, detail)
    throw new AiError("AI_FAILED", describeStatus(response.status))
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new AiError(
      "INVALID_RESPONSE",
      "The AI returned an unreadable response."
    )
  }
  return parseTitleResponse(body)
}

function describeStatus(status: number) {
  if (status === 401 || status === 403)
    return "The OpenRouter key was rejected. Check OPENROUTER_API_KEY."
  if (status === 402) return "OpenRouter credits have run out."
  if (status === 429)
    return "The AI is rate-limited right now. Titles will resume shortly."
  return `The AI service returned an error (${status}).`
}

async function safeErrorMessage(response: Response) {
  try {
    const json = (await response.json()) as { error?: { message?: string } }
    return json.error?.message ?? ""
  } catch {
    return ""
  }
}
