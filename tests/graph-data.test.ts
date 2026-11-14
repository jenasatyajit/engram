import { describe, expect, it } from "vitest"

import type { BoardView, NodeView } from "@/lib/board/repo"
import type { Connection } from "@/lib/db/schema"
import { neighbourMap, nodeRadius, toGraphData } from "@/lib/graph/graph-data"

const now = new Date()

function node(id: string, parentId: string | null, text = id): NodeView {
  return {
    id,
    boardId: "b",
    type: null,
    createdBy: "owner",
    status: "confirmed",
    createdAt: now,
    text,
    versionCount: 1,
    lastEditedAt: now,
    parentId,
  }
}

function link(
  id: string,
  from: string,
  to: string,
  kind: Connection["kind"]
): Connection {
  return {
    id,
    boardId: "b",
    fromNodeId: from,
    toNodeId: to,
    kind,
    createdBy: "owner",
    status: "confirmed",
    createdAt: now,
    deletedAt: null,
  }
}

function board(nodes: NodeView[], connections: Connection[]): BoardView {
  return {
    board: {
      id: "b",
      title: "",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    nodes,
    connections,
  }
}

describe("toGraphData", () => {
  // root -> a -> a1, root -> b, plus a cross-link b supports a1, and a second root r2.
  const view = board(
    [
      node("root", null),
      node("a", "root"),
      node("a1", "a"),
      node("b", "root"),
      node("r2", null),
    ],
    [
      link("c1", "root", "a", "child"),
      link("c2", "a", "a1", "child"),
      link("c3", "root", "b", "child"),
      link("x1", "b", "a1", "supports"),
    ]
  )
  const data = toGraphData(view)
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]))

  it("returns an empty graph for a board that doesn't exist yet", () => {
    expect(toGraphData(null)).toEqual({ nodes: [], links: [] })
  })

  it("computes branch depth from the parent chain, ignoring cross-links", () => {
    expect([
      byId.root.depth,
      byId.a.depth,
      byId.a1.depth,
      byId.b.depth,
      byId.r2.depth,
    ]).toEqual([0, 1, 2, 1, 0])
  })

  it("counts every live link touching a node as its degree", () => {
    expect(byId.root.degree).toBe(2)
    expect(byId.a1.degree).toBe(2)
    expect(byId.r2.degree).toBe(0)
  })

  it("keeps link kinds and endpoints", () => {
    expect(data.links).toContainEqual({
      id: "x1",
      source: "b",
      target: "a1",
      kind: "supports",
    })
  })

  it("survives a parent loop in bad data instead of hanging", () => {
    const loop = toGraphData(board([node("p", "q"), node("q", "p")], []))
    expect(loop.nodes.map((n) => n.depth).every(Number.isFinite)).toBe(true)
  })

  it("maps neighbours in both directions", () => {
    const n = neighbourMap(data)
    expect([...n.get("a1")!].sort()).toEqual(["a", "b"])
    expect(n.get("r2")).toBeUndefined()
  })

  it("grows the dot with degree", () => {
    expect(nodeRadius(9)).toBeGreaterThan(nodeRadius(1))
    expect(nodeRadius(0)).toBe(4)
  })
})
