import type { ChatFn, SearchFn } from "./chat"

/*
 * Deterministic stand-ins for the AI providers, used only by the e2e run.
 * Enabled with ENGRAM_FAKE_AI=1, and only against a local file database,
 * so a misconfigured deployment can never silently use fake AI.
 */

export function fakeAiEnabled(env = process.env) {
  return (
    env.ENGRAM_FAKE_AI === "1" &&
    (env.TURSO_DATABASE_URL ?? "").startsWith("file:")
  )
}

export const FAKE_SOURCE_URL = "https://example.com/engram-e2e-source"

/** First call searches once; after any search result, submits a fixed review about the focus node. */
export const fakeCriticChat: ChatFn = async (request) => {
  const user = request.messages.find((m) => m.role === "user")
  const boardText = user && "content" in user ? (user.content ?? "") : ""
  const focus = boardText.match(/FOCUS: (N\d+)/)?.[1] ?? "N1"
  const searched = request.messages.some((m) => m.role === "tool")
  const canSearch = JSON.stringify(request.tools).includes("web_search")

  if (canSearch && !searched) {
    return {
      content: null,
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "fake_search_1",
          type: "function",
          function: {
            name: "web_search",
            arguments: JSON.stringify({ query: "evidence for the claim" }),
          },
        },
      ],
    }
  }

  return {
    content: null,
    finishReason: "tool_calls",
    toolCalls: [
      {
        id: "fake_submit_1",
        type: "function",
        function: {
          name: "submit_review",
          arguments: JSON.stringify({
            findings: [
              {
                kind: "new_argument",
                message:
                  "ngl this point has a hole, here's a counterpoint to chew on.",
                nodes: [focus],
                argument: {
                  parent: focus,
                  stance: "against",
                  title: "Fake counterpoint",
                  text: "This is a deterministic test argument against the focus node.",
                  sources: searched ? ["S1"] : [],
                },
              },
              {
                kind: "hint",
                message:
                  "quick one: what evidence would actually change your mind here?",
                nodes: [focus],
                argument: null,
              },
            ],
          }),
        },
      },
    ],
  }
}

export const fakeSearch: SearchFn = async () => [
  {
    url: FAKE_SOURCE_URL,
    title: "Example source",
    publishedAt: null,
    highlights: ["A test passage from a fake search result."],
  },
]

export const fakeTitle = async (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .replace(/[^\p{L}\p{N} ]/gu, "") || "Test title"
