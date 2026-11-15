import { describe, expect, it } from "vitest"

import { collapseContext, diffLines, wordDiff } from "@/lib/board/diff"

const kinds = (lines: ReturnType<typeof diffLines>) =>
  lines.map((l) => `${l.kind}:${l.text}`)

describe("diffLines", () => {
  it("shows a first version as all added", () => {
    expect(kinds(diffLines(null, "a\nb"))).toEqual(["add:a", "add:b"])
  })

  it("finds added and removed lines", () => {
    expect(kinds(diffLines("a\nb\nc", "a\nc\nd"))).toEqual([
      "same:a",
      "del:b",
      "same:c",
      "add:d",
    ])
  })

  it("reports no change for identical text", () => {
    const lines = diffLines("a\nb", "a\nb")
    expect(lines.every((l) => l.kind === "same")).toBe(true)
  })

  it("pairs a rewritten line and marks only the changed words", () => {
    const [del, add] = diffLines(
      "I like the red car a lot",
      "I like the blue car a lot"
    )
    expect(del.kind).toBe("del")
    expect(add.kind).toBe("add")
    expect(del.segments?.filter((s) => s.changed).map((s) => s.text)).toEqual([
      "red",
    ])
    expect(add.segments?.filter((s) => s.changed).map((s) => s.text)).toEqual([
      "blue",
    ])
    expect(del.segments?.map((s) => s.text).join("")).toBe(del.text)
    expect(add.segments?.map((s) => s.text).join("")).toBe(add.text)
  })

  it("skips the word diff when lines have almost nothing in common", () => {
    expect(wordDiff("alpha beta gamma", "one two three four")).toBeNull()
    const [del, add] = diffLines("alpha beta gamma", "one two three four")
    expect(del.segments).toBeUndefined()
    expect(add.segments).toBeUndefined()
  })

  it("keeps the line order of an insertion in the middle", () => {
    expect(kinds(diffLines("a\nz", "a\nm\nz"))).toEqual([
      "same:a",
      "add:m",
      "same:z",
    ])
  })

  it("copes with very large inputs without hanging", () => {
    const before = Array.from({ length: 4000 }, (_, i) => `old ${i}`).join("\n")
    const after = Array.from({ length: 4000 }, (_, i) => `new ${i}`).join("\n")
    const lines = diffLines(before, after)
    expect(lines.filter((l) => l.kind === "del")).toHaveLength(4000)
    expect(lines.filter((l) => l.kind === "add")).toHaveLength(4000)
  })
})

describe("collapseContext", () => {
  it("keeps one line of context and folds the rest", () => {
    const lines = diffLines(
      ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n"),
      ["1", "2", "3", "4", "X", "6", "7", "8"].join("\n")
    )
    const out = collapseContext(lines, 1)
    expect(
      out.map((l) =>
        l.kind === "gap" ? `gap:${l.count}` : `${l.kind}:${l.text}`
      )
    ).toEqual(["gap:3", "same:4", "del:5", "add:X", "same:6", "gap:2"])
  })
})
