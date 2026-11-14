import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import * as inputs from "@/lib/board/inputs"
import * as repo from "@/lib/board/repo"
import { deletionEvents } from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

import { createTestDb } from "./helpers/test-db"

let db: Db
let close: () => void

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

async function newBoard(firstText = "root thought") {
  const { board, firstNodeId } = await repo.createBoard(db, {
    title: "test",
    firstText,
  })
  return { boardId: board.id, rootId: firstNodeId! }
}

const nodeIn = (view: repo.BoardView, id: string) =>
  view.nodes.find((n) => n.id === id)

describe("boards", () => {
  it("creates a board with its first thought as a root node", async () => {
    const { boardId, rootId } = await newBoard("hello")
    const view = await repo.getBoard(db, boardId)
    expect(view.nodes).toHaveLength(1)
    expect(nodeIn(view, rootId)).toMatchObject({
      text: "hello",
      versionCount: 1,
      parentId: null,
      createdBy: "owner",
      status: "confirmed",
    })
  })

  it("creates an empty board when there is no first thought", async () => {
    const { board, firstNodeId } = await repo.createBoard(db, {
      title: "empty",
    })
    expect(firstNodeId).toBeNull()
    expect((await repo.getBoard(db, board.id)).nodes).toEqual([])
  })

  it("hides deleted boards from the list and from getBoard, and restores them", async () => {
    const { boardId } = await newBoard()
    await repo.deleteBoard(db, boardId)
    expect((await repo.listBoards(db)).map((b) => b.id)).not.toContain(boardId)
    await expect(repo.getBoard(db, boardId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await repo.restoreBoard(db, boardId)
    expect((await repo.listBoards(db)).map((b) => b.id)).toContain(boardId)
  })

  it("lists the most recently changed board first", async () => {
    const a = await newBoard()
    const b = await newBoard()
    await repo.reviseNode(db, { nodeId: a.rootId, text: "edited later" })
    const [first] = await repo.listBoards(db)
    expect(first.id).toBe(a.boardId)
    expect(b.boardId).not.toBe(first.id)
  })
})

describe("branching", () => {
  it("branches from an explicit parent and leaves the parent untouched", async () => {
    const { boardId, rootId } = await newBoard("parent")
    const { nodeId } = await repo.createNode(db, {
      boardId,
      text: "alternative",
      parentId: rootId,
    })
    const view = await repo.getBoard(db, boardId)
    expect(nodeIn(view, nodeId)?.parentId).toBe(rootId)
    expect(nodeIn(view, rootId)).toMatchObject({
      text: "parent",
      versionCount: 1,
    })
    expect(view.connections).toEqual([
      expect.objectContaining({
        fromNodeId: rootId,
        toNodeId: nodeId,
        kind: "child",
      }),
    ])
  })

  it("attaches to the most recently edited node when no parent is given", async () => {
    const { boardId, rootId } = await newBoard()
    const { nodeId: a } = await repo.createNode(db, {
      boardId,
      text: "a",
      parentId: rootId,
    })
    await repo.createNode(db, { boardId, text: "b", parentId: rootId })
    // Editing "a" makes it the most recent, even though "b" was created after it.
    await repo.reviseNode(db, { nodeId: a, text: "a, revised" })
    const { parentId } = await repo.createNode(db, { boardId, text: "c" })
    expect(parentId).toBe(a)
  })

  it("makes a root when parentId is null, or when the board is empty", async () => {
    const { boardId } = await newBoard()
    expect(
      (await repo.createNode(db, { boardId, text: "new root", parentId: null }))
        .parentId
    ).toBeNull()
    const { board } = await repo.createBoard(db, { title: "empty" })
    expect(
      (await repo.createNode(db, { boardId: board.id, text: "first" })).parentId
    ).toBeNull()
  })

  it("skips deleted nodes when picking the most recently edited one", async () => {
    const { boardId, rootId } = await newBoard()
    const { nodeId } = await repo.createNode(db, {
      boardId,
      text: "x",
      parentId: rootId,
    })
    await repo.deleteNode(db, nodeId)
    expect(await repo.mostRecentlyEditedNodeId(db, boardId)).toBe(rootId)
  })

  it("rejects a parent from another board, or a deleted parent", async () => {
    const one = await newBoard()
    const two = await newBoard()
    await expect(
      repo.createNode(db, {
        boardId: one.boardId,
        text: "x",
        parentId: two.rootId,
      })
    ).rejects.toMatchObject({ code: "INVALID" })

    const { nodeId } = await repo.createNode(db, {
      boardId: one.boardId,
      text: "y",
      parentId: one.rootId,
    })
    await repo.deleteNode(db, nodeId)
    await expect(
      repo.createNode(db, { boardId: one.boardId, text: "z", parentId: nodeId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("revising", () => {
  it("adds a version to the same node and keeps every old version", async () => {
    const { boardId, rootId } = await newBoard("v1")
    await repo.reviseNode(db, {
      nodeId: rootId,
      text: "v2",
      note: "I was wrong",
    })
    await repo.reviseNode(db, { nodeId: rootId, text: "v3" })

    const view = await repo.getBoard(db, boardId)
    expect(view.nodes).toHaveLength(1)
    expect(nodeIn(view, rootId)).toMatchObject({ text: "v3", versionCount: 3 })

    const history = await repo.getNodeHistory(db, rootId)
    expect(history.map((v) => v.text)).toEqual(["v1", "v2", "v3"])
    expect(history.map((v) => v.note)).toEqual([null, "I was wrong", null])
  })

  it("marks versions saved on leaving as auto-saved", async () => {
    const { rootId } = await newBoard("v1")
    await repo.reviseNode(db, { nodeId: rootId, text: "v2" })
    await repo.reviseNode(db, { nodeId: rootId, text: "v3", autoSaved: true })
    const history = await repo.getNodeHistory(db, rootId)
    expect(history.map((v) => v.autoSaved)).toEqual([false, false, true])
  })

  it("writes nothing when the text did not change", async () => {
    const { rootId } = await newBoard("same")
    expect(await repo.reviseNode(db, { nodeId: rootId, text: "same" })).toEqual(
      { changed: false }
    )
    expect(await repo.getNodeHistory(db, rootId)).toHaveLength(1)
  })

  it("cannot revise a deleted node, but its history stays readable", async () => {
    const { rootId } = await newBoard("kept")
    await repo.deleteNode(db, rootId)
    await expect(
      repo.reviseNode(db, { nodeId: rootId, text: "nope" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    expect((await repo.getNodeHistory(db, rootId)).map((v) => v.text)).toEqual([
      "kept",
    ])
  })

  it("sets and clears the type label without creating a version", async () => {
    const { boardId, rootId } = await newBoard()
    await repo.setNodeType(db, rootId, "assumption")
    expect(nodeIn(await repo.getBoard(db, boardId), rootId)?.type).toBe(
      "assumption"
    )
    await repo.setNodeType(db, rootId, null)
    const node = nodeIn(await repo.getBoard(db, boardId), rootId)
    expect(node).toMatchObject({ type: null, versionCount: 1 })
  })
})

describe("soft delete", () => {
  it("hides a deleted node and its links, then brings both back on restore", async () => {
    const { boardId, rootId } = await newBoard()
    const { nodeId } = await repo.createNode(db, {
      boardId,
      text: "child",
      parentId: rootId,
    })

    await repo.deleteNode(db, nodeId)
    let view = await repo.getBoard(db, boardId)
    expect(nodeIn(view, nodeId)).toBeUndefined()
    expect(view.connections).toEqual([])

    await repo.restoreNode(db, nodeId)
    view = await repo.getBoard(db, boardId)
    expect(nodeIn(view, nodeId)?.parentId).toBe(rootId)
    expect(view.connections).toHaveLength(1)
  })

  it("logs every delete and restore, and ignores repeats", async () => {
    const { rootId } = await newBoard()
    await repo.deleteNode(db, rootId)
    await repo.deleteNode(db, rootId) // already deleted: no-op
    await repo.restoreNode(db, rootId)
    await repo.restoreNode(db, rootId) // already live: no-op
    await repo.deleteNode(db, rootId)

    const events = await db
      .select()
      .from(deletionEvents)
      .where(eq(deletionEvents.entityId, rootId))
      .orderBy(deletionEvents.createdAt)
    expect(events.map((e) => e.action)).toEqual([
      "deleted",
      "restored",
      "deleted",
    ])
  })
})

describe("cross-links", () => {
  it("links two nodes and returns the same link when asked twice", async () => {
    const { boardId, rootId } = await newBoard()
    const { nodeId } = await repo.createNode(db, {
      boardId,
      text: "evidence",
      parentId: null,
    })
    const input = {
      boardId,
      fromNodeId: nodeId,
      toNodeId: rootId,
      kind: "supports" as const,
    }
    const first = await repo.connectNodes(db, input)
    const second = await repo.connectNodes(db, input)
    expect(second.id).toBe(first.id)
    expect(first).toMatchObject({
      kind: "supports",
      createdBy: "owner",
      status: "confirmed",
    })
  })

  it("rejects self-links, other boards and deleted nodes", async () => {
    const one = await newBoard()
    const two = await newBoard()
    const base = { boardId: one.boardId, kind: "related" as const }

    await expect(
      repo.connectNodes(db, {
        ...base,
        fromNodeId: one.rootId,
        toNodeId: one.rootId,
      })
    ).rejects.toMatchObject({ code: "INVALID" })
    await expect(
      repo.connectNodes(db, {
        ...base,
        fromNodeId: one.rootId,
        toNodeId: two.rootId,
      })
    ).rejects.toMatchObject({ code: "INVALID" })

    const { nodeId } = await repo.createNode(db, {
      boardId: one.boardId,
      text: "gone",
      parentId: null,
    })
    await repo.deleteNode(db, nodeId)
    await expect(
      repo.connectNodes(db, {
        ...base,
        fromNodeId: one.rootId,
        toNodeId: nodeId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("removes and restores a cross-link, but never a branch link", async () => {
    const { boardId, rootId } = await newBoard()
    const { nodeId } = await repo.createNode(db, {
      boardId,
      text: "b",
      parentId: rootId,
    })
    const link = await repo.connectNodes(db, {
      boardId,
      fromNodeId: nodeId,
      toNodeId: rootId,
      kind: "contradicts",
    })

    await repo.disconnect(db, link.id)
    expect(
      (await repo.getBoard(db, boardId)).connections.map((c) => c.kind)
    ).toEqual(["child"])
    await repo.restoreConnection(db, link.id)
    expect((await repo.getBoard(db, boardId)).connections).toHaveLength(2)

    const branch = (await repo.getBoard(db, boardId)).connections.find(
      (c) => c.kind === "child"
    )!
    await expect(repo.disconnect(db, branch.id)).rejects.toMatchObject({
      code: "INVALID",
    })
  })
})

describe("input validation", () => {
  const uuid = crypto.randomUUID()

  it("rejects empty or whitespace-only node text", () => {
    expect(
      inputs.createNodeInput.safeParse({ boardId: uuid, text: "   " }).success
    ).toBe(false)
    expect(
      inputs.reviseNodeInput.safeParse({ nodeId: uuid, text: "" }).success
    ).toBe(false)
  })

  it("rejects ids that are not UUIDs", () => {
    expect(
      inputs.nodeIdInput.safeParse({ nodeId: "1; DROP TABLE nodes" }).success
    ).toBe(false)
  })

  it("rejects text over the length limits", () => {
    const long = "x".repeat(inputs.LIMITS.nodeText + 1)
    expect(
      inputs.createNodeInput.safeParse({ boardId: uuid, text: long }).success
    ).toBe(false)
    const longTitle = "x".repeat(inputs.LIMITS.title + 1)
    expect(
      inputs.createBoardInput.safeParse({ title: longTitle }).success
    ).toBe(false)
  })

  it("only allows cross-link kinds to be created by hand", () => {
    const base = {
      boardId: uuid,
      fromNodeId: uuid,
      toNodeId: crypto.randomUUID(),
    }
    expect(
      inputs.connectInput.safeParse({ ...base, kind: "child" }).success
    ).toBe(false)
    expect(
      inputs.connectInput.safeParse({ ...base, kind: "depends-on" }).success
    ).toBe(true)
  })

  it("keeps parentId's three meanings: omitted, null, or an id", () => {
    expect(
      inputs.createNodeInput.parse({ boardId: uuid, text: "a" }).parentId
    ).toBeUndefined()
    expect(
      inputs.createNodeInput.parse({ boardId: uuid, text: "a", parentId: null })
        .parentId
    ).toBeNull()
  })
})
