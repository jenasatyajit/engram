import "server-only"

import { z } from "zod"

import { safeHttpUrl } from "@/lib/safe-url"

import type { SearchFn, WebResult } from "./chat"
import { AiError } from "./errors"

/*
 * Exa web search (SPEC.md 7.5, D11). Server-only. Results are untrusted data:
 * only http(s) links are kept, and passages are length-capped.
 */

const ENDPOINT = "https://api.exa.ai/search"
const TIMEOUT_MS = 15_000
export const SEARCH_RESULTS = 5
const MAX_HIGHLIGHT_CHARS = 600

export function isExaConfigured(env = process.env) {
  return Boolean(env.EXA_API_KEY?.trim())
}

const resultSchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  publishedDate: z.string().nullable().optional(),
  highlights: z.array(z.string()).nullable().optional(),
})
const responseSchema = z.object({ results: z.array(resultSchema) })

export const exaSearch: SearchFn = async (query) => {
  const apiKey = process.env.EXA_API_KEY?.trim()
  if (!apiKey)
    throw new AiError("AI_NOT_CONFIGURED", "Web search is not configured.")

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: SEARCH_RESULTS,
        contents: { highlights: { maxCharacters: 1_500 } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    console.error("[exa] request failed", String(error))
    throw new AiError("AI_FAILED", "Web search is unreachable.")
  }
  if (!response.ok) {
    console.error("[exa]", response.status)
    throw new AiError(
      "AI_FAILED",
      `Web search returned an error (${response.status}).`
    )
  }

  const parsed = responseSchema.safeParse(
    await response.json().catch(() => null)
  )
  if (!parsed.success) {
    console.error("[exa] unexpected response shape")
    throw new AiError(
      "INVALID_RESPONSE",
      "Web search returned an unexpected response."
    )
  }

  const results: WebResult[] = []
  for (const r of parsed.data.results) {
    const url = safeHttpUrl(r.url)
    if (!url) continue
    results.push({
      url,
      title: (r.title ?? "").trim().slice(0, 200) || new URL(url).hostname,
      publishedAt: r.publishedDate ?? null,
      highlights: (r.highlights ?? [])
        .map((h) => h.trim().slice(0, MAX_HIGHLIGHT_CHARS))
        .filter(Boolean)
        .slice(0, 3),
    })
  }
  return results.slice(0, SEARCH_RESULTS)
}
