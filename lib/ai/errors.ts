/** Errors from the AI module. Messages are safe to show to the owner. */
export type AiErrorCode =
  "AI_NOT_CONFIGURED" | "DAILY_CAP" | "AI_FAILED" | "INVALID_RESPONSE"

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string
  ) {
    super(message)
    this.name = "AiError"
  }
}
