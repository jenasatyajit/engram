/*
 * Provider-neutral chat types (OpenAI-compatible shape, which Sarvam v1 uses).
 * Feature code depends on these, not on a provider, so the model can be swapped
 * (SPEC.md 7.1) and tests can pass a fake.
 */

export type ToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

export type ToolChoice =
  "auto" | "required" | { type: "function"; function: { name: string } }

export type ChatRequest = {
  messages: ChatMessage[]
  tools: readonly unknown[]
  toolChoice: ToolChoice
  /** Always set explicitly (SPEC.md 7.2). */
  maxTokens: number
  temperature?: number
}

export type ChatReply = {
  content: string | null
  toolCalls: ToolCall[]
  finishReason: string | null
}

export type ChatFn = (request: ChatRequest) => Promise<ChatReply>

/** One web search result, as the server received it. */
export type WebResult = {
  url: string
  title: string
  publishedAt: string | null
  highlights: string[]
}

export type SearchFn = (query: string) => Promise<WebResult[]>
