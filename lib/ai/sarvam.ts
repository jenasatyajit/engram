import "server-only"

import { z } from "zod"

import type { ChatFn, ChatReply, ToolCall } from "./chat"
import { AiError } from "./errors"

/*
 * Sarvam client: the single place Engram talks to Sarvam (SPEC.md 7.1, D9).
 * v1 chat completions, model sarvam-105b. Server-only; the key never reaches the browser.
 */

const ENDPOINT = "https://api.sarvam.ai/v1/chat/completions"
export const SARVAM_MODEL = "sarvam-105b"
const TIMEOUT_MS = 90_000
const REASONING_EFFORTS = ["none", "low", "medium", "high", "max"] as const

export function isSarvamConfigured(env = process.env) {
  return Boolean(env.SARVAM_API_KEY?.trim())
}

function reasoningEffort(env = process.env) {
  const value = env.SARVAM_REASONING_EFFORT?.trim().toLowerCase()
  return (REASONING_EFFORTS as readonly string[]).includes(value ?? "")
    ? value
    : "low"
}

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function").catch("function"),
  function: z.object({ name: z.string(), arguments: z.string().catch("{}") }),
})

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z.array(toolCallSchema).nullable().optional(),
        }),
      })
    )
    .min(1),
})

/** One chat completion call. Throws AiError with an owner-safe message on any failure. */
export const sarvamChat: ChatFn = async (request) => {
  const apiKey = process.env.SARVAM_API_KEY?.trim()
  if (!apiKey) {
    throw new AiError(
      "AI_NOT_CONFIGURED",
      "Critic reviews need a Sarvam key: add SARVAM_API_KEY to .env.local and restart."
    )
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SARVAM_MODEL,
        messages: request.messages,
        tools: request.tools,
        tool_choice: request.toolChoice,
        max_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.3,
        reasoning_effort: reasoningEffort(),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    console.error(
      "[sarvam] request failed",
      timedOut ? "timeout" : String(error)
    )
    throw new AiError(
      "AI_FAILED",
      timedOut
        ? "The AI took too long to review this board."
        : "Couldn't reach the AI service."
    )
  }

  if (!response.ok) {
    console.error("[sarvam]", response.status, await safeErrorMessage(response))
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

  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) {
    console.error(
      "[sarvam] unexpected response shape",
      parsed.error.issues[0]?.message
    )
    throw new AiError(
      "INVALID_RESPONSE",
      "The AI returned an unexpected response."
    )
  }
  const choice = parsed.data.choices[0]
  const reply: ChatReply = {
    content: choice.message.content ?? null,
    toolCalls: (choice.message.tool_calls ?? []) as ToolCall[],
    finishReason: choice.finish_reason ?? null,
  }
  return reply
}

function describeStatus(status: number) {
  if (status === 401 || status === 403)
    return "The Sarvam key was rejected. Check SARVAM_API_KEY."
  if (status === 402) return "Sarvam credits have run out."
  if (status === 429)
    return "The AI is rate-limited right now. Reviews will resume shortly."
  if (status === 422 || status === 400)
    return "The AI rejected the review request."
  return `The AI service returned an error (${status}).`
}

async function safeErrorMessage(response: Response) {
  try {
    const json = (await response.json()) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof json.error === "string") return json.error
    return json.error?.message ?? json.message ?? ""
  } catch {
    return ""
  }
}
