import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { triggerField } from "@/components/editor/mention-extension"
import {
  canCreateMention,
  detectTrigger,
  findMentions,
  formatMention,
  mentionOptions,
  mentionsToPlain,
  type MentionCandidate,
} from "@/lib/board/mentions"
import { nodeLabel, snippet } from "@/lib/board/labels"

const ID_A = "7bca14a8-72ae-441c-bb62-200cd77fcfe4"
const ID_B = "ef62a521-8923-4644-aaa9-b8dffbf02d77"

describe("mention tokens", () => {
  it("formats and finds tokens", () => {
    const text = `see ${formatMention("Rust basics", ID_A)} and ${formatMention("Go", ID_B)}.`
    const found = findMentions(text)
    expect(found.map((m) => [m.title, m.id])).toEqual([
      ["Rust basics", ID_A],
      ["Go", ID_B],
    ])
    expect(text.slice(found[0].from, found[0].to)).toBe(
      `[[Rust basics|${ID_A}]]`
    )
  })

  it("strips characters that would break the token from titles", () => {
    expect(formatMention("a|b [c]\nd", ID_A)).toBe(`[[a b c d|${ID_A}]]`)
  })

  it("ignores plain [[text]] and malformed ids", () => {
    expect(findMentions("[[plain]] and [[x|not-an-id]]")).toEqual([])
  })

  it("turns tokens into readable text, preferring the live title", () => {
    const text = `a ${formatMention("Old name", ID_A)} b`
    expect(mentionsToPlain(text)).toBe("a [[Old name]] b")
    expect(
      mentionsToPlain(text, (id) => (id === ID_A ? "New name" : undefined))
    ).toBe("a [[New name]] b")
  })

  it("keeps ids out of labels", () => {
    const text = `${formatMention("Rust", ID_A)} is fast`
    expect(snippet(text, 40)).toBe("[[Rust]] is fast")
    expect(nodeLabel({ title: null, text }, 40)).toBe("[[Rust]] is fast")
  })
})

describe("detectTrigger", () => {
  it("finds an open [[ with an auto-closed ]]", () => {
    // "hello [[ru]]" with the cursor after "ru"
    expect(detectTrigger("hello [[ru]]", 10, 100)).toEqual({
      from: 106,
      to: 112,
      query: "ru",
    })
  })

  it("works without the closing brackets", () => {
    expect(detectTrigger("[[", 2, 0)).toEqual({ from: 0, to: 2, query: "" })
  })

  it("is closed once the brackets are finished or the cursor leaves", () => {
    expect(detectTrigger("[[ru]]", 6, 0)).toBeNull()
    expect(detectTrigger("[[ru]] more", 11, 0)).toBeNull()
    expect(detectTrigger("plain text", 5, 0)).toBeNull()
  })

  it("does not trigger inside a finished tag", () => {
    const line = `[[Rust|${ID_A}]]`
    expect(detectTrigger(line, line.length - 3, 0)).toBeNull()
  })
})

describe("triggerField", () => {
  const stateWith = (doc: string, head: number) =>
    EditorState.create({
      doc,
      selection: { anchor: head },
      extensions: [triggerField],
    })

  it("follows the document and cursor", () => {
    let state = stateWith("", 0)
    state = state.update({
      changes: { from: 0, insert: "[[]]" },
      selection: { anchor: 2 },
    }).state
    expect(state.field(triggerField).trigger).toEqual({
      from: 0,
      to: 4,
      query: "",
    })

    state = state.update({
      changes: { from: 2, insert: "ru" },
      selection: { anchor: 4 },
    }).state
    expect(state.field(triggerField).trigger?.query).toBe("ru")

    state = state.update({ selection: { anchor: 6 } }).state
    expect(state.field(triggerField).trigger).toBeNull()
  })
})

describe("mentionOptions", () => {
  const node = (
    id: string,
    title: string,
    parentId: string | null,
    n: number
  ): MentionCandidate => ({
    id,
    title,
    text: title,
    type: null,
    parentId,
    createdAt: new Date(n),
  })
  const nodes = [
    node("root", "Should I learn Rust", null, 1),
    node("a", "Memory safety", "root", 2),
    node("b", "Rust is slow to learn", "root", 3),
    node("c", "Go basics", null, 4),
  ]
  const labelOf = (n: MentionCandidate) => n.title ?? n.text

  it("lists the current thought's branches first and never the thought itself", () => {
    const options = mentionOptions(nodes, "", "root", labelOf)
    expect(options.map((o) => o.id)).toEqual(["a", "b", "c"])
    expect(options.map((o) => o.isChild)).toEqual([true, true, false])
  })

  it("filters case-insensitively and puts prefix matches first", () => {
    const options = mentionOptions(nodes, "rust", "c", labelOf)
    expect(options.map((o) => o.id)).toEqual(["b", "root"])
  })

  it("offers creating a branch only for a new name", () => {
    const options = mentionOptions(nodes, "go basics", "root", labelOf)
    expect(canCreateMention(options, "go basics")).toBe(false)
    expect(canCreateMention(options, "something new")).toBe(true)
    expect(canCreateMention(options, "   ")).toBe(false)
  })
})
