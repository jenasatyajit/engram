import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { AiError } from "@/lib/ai/errors"
import { titleNode } from "@/lib/ai/title-node"
import { cleanTitle, parseTitleResponse } from "@/lib/ai/titles"
import { callsToday, reserveAiCall } from "@/lib/ai/usage"
import { branchPlaceholder, nodeLabel } from "@/lib/board/labels"
import * as repo from "@/lib/board/repo"
import { nodes } from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

import { createTestDb } from "./helpers/test-db"

let db: Db
let close: () => void

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

const toolResponse = (args: unknown) => ({
  choices: [
    {
      message: {
        content: null,
        tool_calls: [
          { function: { name: "set_title", arguments: JSON.stringify(args) } },
        ],
      },
    },
  ],
})

describe("labels", () => {
  it("prefers the title and falls back to the first line", () => {
    expect(nodeLabel({ title: "Rust vs Go", text: "long text" })).toBe(
      "Rust vs Go"
    )
    expect(nodeLabel({ title: null, text: "First line\nsecond" })).toBe(
      "First line"
    )
    expect(nodeLabel({ title: "  ", text: "Fallback" })).toBe("Fallback")
  })

  it("builds branch placeholders and caps their length", () => {
    expect(branchPlaceholder(2, "Rust vs Go")).toBe("B2: Rust vs Go")
    expect(branchPlaceholder(1, "x".repeat(200)).length).toBeLessThanOrEqual(80)
  })
})

describe("title parsing", () => {
  it("cleans quotes, prefixes and trailing punctuation", () => {
    expect(cleanTitle('  "Title: Rust vs Go."  ')).toBe("Rust vs Go")
  })

  it("reads the forced tool call", () => {
    expect(
      parseTitleResponse(toolResponse({ title: "Learning Rust Basics" }))
    ).toBe("Learning Rust Basics")
  })

  it("falls back to a JSON object in the content", () => {
    const response = {
      choices: [{ message: { content: 'Sure: {"title": "Go Speed"}' } }],
    }
    expect(parseTitleResponse(response)).toBe("Go Speed")
  })

  it("rejects missing, malformed or overlong titles", () => {
    expect(() =>
      parseTitleResponse({ choices: [{ message: { content: "Rust" } }] })
    ).toThrow(AiError)
    expect(() => parseTitleResponse(toolResponse({ name: "x" }))).toThrow(
      AiError
    )
    expect(() =>
      parseTitleResponse(
        toolResponse({ title: "one two three four five six seven" })
      )
    ).toThrow(AiError)
  })
})

describe("placeholders on new branches", () => {
  it("numbers branches under a parent and never reuses a number", async () => {
    const { board, firstNodeId } = await repo.createBoard(db, {
      title: "t",
      firstText: "Root idea",
    })
    const rootId = firstNodeId!
    const a = await repo.createNode(db, {
      boardId: board.id,
      text: "a",
      parentId: rootId,
    })
    const b = await repo.createNode(db, {
      boardId: board.id,
      text: "b",
      parentId: rootId,
    })
    await repo.deleteNode(db, b.nodeId)
    const c = await repo.createNode(db, {
      boardId: board.id,
      text: "c",
      parentId: rootId,
    })

    const view = await repo.getBoard(db, board.id)
    const titleOf = (id: string) => view.nodes.find((n) => n.id === id)?.title
    expect(titleOf(rootId)).toBeNull()
    expect(titleOf(a.nodeId)).toBe("B1: Root idea")
    expect(titleOf(c.nodeId)).toBe("B3: Root idea")
    expect(view.nodes.find((n) => n.id === a.nodeId)?.titleSource).toBe(
      "placeholder"
    )
  })
})

describe("titleNode", () => {
  const deps = (title = "Rust Learning Plan") => ({
    generate: async () => title,
    dailyCap: 1000,
  })

  it("applies an AI title for the latest version, then skips until the text changes", async () => {
    const { board, firstNodeId } = await repo.createBoard(db, {
      title: "t",
      firstText: "Learn Rust",
    })
    expect(await titleNode(db, firstNodeId!, deps())).toEqual({
      status: "applied",
      title: "Rust Learning Plan",
    })
    expect(await titleNode(db, firstNodeId!, deps())).toEqual({
      status: "unchanged",
    })

    const node = (await repo.getBoard(db, board.id)).nodes[0]
    expect(node).toMatchObject({
      title: "Rust Learning Plan",
      titleSource: "ai",
    })
  })

  it("drops a title written for a version that is no longer the latest", async () => {
    const { firstNodeId } = await repo.createBoard(db, {
      title: "t",
      firstText: "v1 text",
    })
    const nodeId = firstNodeId!
    const slow = {
      dailyCap: 1000,
      // The owner revises while the AI is still writing.
      generate: async () => {
        await repo.reviseNode(db, { nodeId, text: "v2 text" })
        return "Old Title"
      },
    }
    expect(await titleNode(db, nodeId, slow)).toEqual({ status: "stale" })
    const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId))
    expect(row.title).toBeNull()
  })

  it("stops at the daily cap without calling the model", async () => {
    const { firstNodeId } = await repo.createBoard(db, {
      title: "t",
      firstText: "Capped note",
    })
    let called = false
    await expect(
      titleNode(db, firstNodeId!, {
        dailyCap: 0,
        generate: async () => {
          called = true
          return "x"
        },
      })
    ).rejects.toMatchObject({ code: "DAILY_CAP" })
    expect(called).toBe(false)
  })
})

describe("daily cap", () => {
  it("counts calls per day and refuses once the cap is reached", async () => {
    const day = new Date("2030-01-01T10:00:00Z")
    expect(await reserveAiCall(db, 2, day)).toBe(true)
    expect(await reserveAiCall(db, 2, day)).toBe(true)
    expect(await reserveAiCall(db, 2, day)).toBe(false)
    expect(await callsToday(db, day)).toBe(2)
    expect(await reserveAiCall(db, 2, new Date("2030-01-02T10:00:00Z"))).toBe(
      true
    )
  })
})
