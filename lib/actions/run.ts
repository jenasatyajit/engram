import type { z } from "zod"

import { requireUser } from "@/lib/auth/current-user"
import { AiError, type AiErrorCode } from "@/lib/ai/errors"
import { BoardError, type BoardErrorCode } from "@/lib/board/repo"

/*
 * Shared wrapper for server actions: validate input, run, and return a result
 * object instead of throwing, so the UI can show errors without crashing.
 * Raw errors are logged on the server and never sent to the browser.
 */

export type ActionError = {
  code:
    | "INVALID_INPUT"
    | "UNAUTHORIZED"
    | BoardErrorCode
    | AiErrorCode
    | "SERVER_ERROR"
  message: string
}
export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError }

export async function runAction<S extends z.ZodType, T>(
  label: string,
  schema: S,
  input: unknown,
  fn: (parsed: z.infer<S>) => Promise<T>
): Promise<ActionResult<T>> {
  if (!(await requireUser())) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Please log in again." },
    }
  }
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
    }
  }
  try {
    return { ok: true, data: await fn(parsed.data) }
  } catch (error) {
    if (error instanceof BoardError || error instanceof AiError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    console.error(`[${label} action]`, error)
    return {
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: "Something went wrong. Please try again.",
      },
    }
  }
}
