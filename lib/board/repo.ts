import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import {
  boards,
  connections,
  nodes,
  nodeVersions,
  type Board,
  type Connection,
  type NodeType,
  type NodeVersion,
} from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

import type {
  ConnectInput,
  CreateBoardInput,
  CreateNodeInput,
  ReviseNodeInput,
} from "./inputs"

/*
 * Board domain logic for milestone 1 (no AI). See SPEC.md sections 5 and 9.
 *
 * - Branch: createNode with a parent. New node + "child" link; the parent is untouched.
 * - Revise: reviseNode. Same node, new version; nothing is overwritten.
 * - Delete / restore: soft, via deleted_at. The database logs each change for replay.
 *
 * Inputs are assumed already validated (see inputs.ts); these functions enforce
 * the rules that need the database: existence, same board, not deleted.
 */

export type BoardErrorCode = "NOT_FOUND" | "INVALID"

export class BoardError extends Error {
  constructor(
    readonly code: BoardErrorCode,
    message: string
  ) {
    super(message)
    this.name = "BoardError"
  }
}

/** A node as the UI sees it: its row plus its current text. */
export type NodeView = {
  id: string
  boardId: string
  type: NodeType | null
  createdBy: "owner" | "ai"
  status: "confirmed" | "suggested"
  createdAt: Date
  text: string
  versionCount: number
  lastEditedAt: Date
  parentId: string | null
}

export type BoardView = {
  board: Board
  nodes: NodeView[]
  /** Live connections whose two ends are both live. */
  connections: Connection[]
}

// Versions created in the same millisecond still sort by insertion order.
const versionOrderDesc = [
  desc(nodeVersions.createdAt),
  sql`${nodeVersions}.rowid desc`,
]
const versionOrderAsc = [
  asc(nodeVersions.createdAt),
  sql`${nodeVersions}.rowid asc`,
]

// ---------- Boards ----------

export async function createBoard(db: Db, input: CreateBoardInput) {
  const now = new Date()
  const boardId = crypto.randomUUID()

  if (input.firstText === undefined) {
    const [board] = await db
      .insert(boards)
      .values({
        id: boardId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return { board, firstNodeId: null }
  }

  const nodeId = crypto.randomUUID()
  const [[board]] = await db.batch([
    db
      .insert(boards)
      .values({
        id: boardId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
    db
      .insert(nodes)
      .values({ id: nodeId, boardId, createdBy: "owner", createdAt: now }),
    db.insert(nodeVersions).values({
      nodeId,
      text: input.firstText,
      author: "owner",
      createdAt: now,
    }),
  ])
  return { board, firstNodeId: nodeId }
}

export async function renameBoard(db: Db, boardId: string, title: string) {
  await requireLiveBoard(db, boardId)
  const [board] = await db
    .update(boards)
    .set({ title, updatedAt: new Date() })
    .where(eq(boards.id, boardId))
    .returning()
  return board
}

export async function listBoards(db: Db, limit = 50) {
  return db
    .select()
    .from(boards)
    .where(isNull(boards.deletedAt))
    .orderBy(desc(boards.updatedAt))
    .limit(limit)
}

export async function deleteBoard(db: Db, boardId: string) {
  const board = await requireBoard(db, boardId)
  if (board.deletedAt) return
  await db
    .update(boards)
    .set({ deletedAt: new Date() })
    .where(eq(boards.id, boardId))
}

export async function restoreBoard(db: Db, boardId: string) {
  const board = await requireBoard(db, boardId)
  if (!board.deletedAt) return
  await db.update(boards).set({ deletedAt: null }).where(eq(boards.id, boardId))
}

/** The whole live board: nodes with current text, and connections between live nodes. */
export async function getBoard(db: Db, boardId: string): Promise<BoardView> {
  const board = await requireLiveBoard(db, boardId)

  const [nodeRows, versionRows, connectionRows] = await db.batch([
    db
      .select()
      .from(nodes)
      .where(and(eq(nodes.boardId, boardId), isNull(nodes.deletedAt))),
    db
      .select({
        nodeId: nodeVersions.nodeId,
        text: nodeVersions.text,
        createdAt: nodeVersions.createdAt,
      })
      .from(nodeVersions)
      .innerJoin(nodes, eq(nodes.id, nodeVersions.nodeId))
      .where(and(eq(nodes.boardId, boardId), isNull(nodes.deletedAt)))
      .orderBy(...versionOrderAsc),
    db
      .select()
      .from(connections)
      .where(
        and(eq(connections.boardId, boardId), isNull(connections.deletedAt))
      ),
  ])

  // Rows are oldest-first, so the last one seen per node is its current version.
  const latest = new Map<
    string,
    { text: string; createdAt: Date; count: number }
  >()
  for (const v of versionRows) {
    const prev = latest.get(v.nodeId)
    latest.set(v.nodeId, {
      text: v.text,
      createdAt: v.createdAt,
      count: (prev?.count ?? 0) + 1,
    })
  }

  const liveIds = new Set(nodeRows.map((n) => n.id))
  const liveConnections = connectionRows.filter(
    (c) => liveIds.has(c.fromNodeId) && liveIds.has(c.toNodeId)
  )
  const parentOf = new Map(
    liveConnections
      .filter((c) => c.kind === "child")
      .map((c) => [c.toNodeId, c.fromNodeId])
  )

  const nodeViews = nodeRows.map((n): NodeView => {
    const v = latest.get(n.id)
    return {
      id: n.id,
      boardId: n.boardId,
      type: n.type,
      createdBy: n.createdBy,
      status: n.status,
      createdAt: n.createdAt,
      text: v?.text ?? "",
      versionCount: v?.count ?? 0,
      lastEditedAt: v?.createdAt ?? n.createdAt,
      parentId: parentOf.get(n.id) ?? null,
    }
  })

  return { board, nodes: nodeViews, connections: liveConnections }
}

// ---------- Nodes ----------

/**
 * Capture or branch. Creates a node with its first version.
 * Parent: `parentId` if given; `null` for a new root; omitted = the most recently edited node.
 */
export async function createNode(db: Db, input: CreateNodeInput) {
  await requireLiveBoard(db, input.boardId)

  let parentId: string | null
  if (input.parentId === undefined) {
    parentId = await mostRecentlyEditedNodeId(db, input.boardId)
  } else if (input.parentId === null) {
    parentId = null
  } else {
    const parent = await requireLiveNode(db, input.parentId)
    if (parent.boardId !== input.boardId) {
      throw new BoardError(
        "INVALID",
        "The parent node belongs to a different board"
      )
    }
    parentId = parent.id
  }

  const now = new Date()
  const nodeId = crypto.randomUUID()
  const insertNode = db.insert(nodes).values({
    id: nodeId,
    boardId: input.boardId,
    type: input.type ?? null,
    createdBy: "owner",
    createdAt: now,
  })
  const insertVersion = db
    .insert(nodeVersions)
    .values({ nodeId, text: input.text, author: "owner", createdAt: now })
  const touchBoard = db
    .update(boards)
    .set({ updatedAt: now })
    .where(eq(boards.id, input.boardId))

  if (parentId) {
    await db.batch([
      insertNode,
      insertVersion,
      db.insert(connections).values({
        boardId: input.boardId,
        fromNodeId: parentId,
        toNodeId: nodeId,
        kind: "child",
        createdBy: "owner",
        createdAt: now,
      }),
      touchBoard,
    ])
  } else {
    await db.batch([insertNode, insertVersion, touchBoard])
  }

  return { nodeId, parentId }
}

/**
 * Revise: add a new version to an existing node. Called when the owner leaves the node.
 * Returns changed=false (and writes nothing) if the text is the same as the current version.
 */
export async function reviseNode(db: Db, input: ReviseNodeInput) {
  const node = await requireLiveNode(db, input.nodeId)
  const [current] = await db
    .select({ text: nodeVersions.text })
    .from(nodeVersions)
    .where(eq(nodeVersions.nodeId, node.id))
    .orderBy(...versionOrderDesc)
    .limit(1)

  if (current?.text === input.text) return { changed: false as const }

  const now = new Date()
  const [[version]] = await db.batch([
    db
      .insert(nodeVersions)
      .values({
        nodeId: node.id,
        text: input.text,
        note: input.note || null,
        author: "owner",
        autoSaved: input.autoSaved ?? false,
        createdAt: now,
      })
      .returning(),
    db
      .update(boards)
      .set({ updatedAt: now })
      .where(eq(boards.id, node.boardId)),
  ])
  return { changed: true as const, version }
}

/** Set or clear the optional type label. Labels are not versioned. */
export async function setNodeType(
  db: Db,
  nodeId: string,
  type: NodeType | null
) {
  const node = await requireLiveNode(db, nodeId)
  await db.batch([
    db.update(nodes).set({ type }).where(eq(nodes.id, nodeId)),
    db
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, node.boardId)),
  ])
}

/** Every version of a node, oldest first. Works for deleted nodes too. */
export async function getNodeHistory(
  db: Db,
  nodeId: string
): Promise<NodeVersion[]> {
  await requireNode(db, nodeId)
  return db
    .select()
    .from(nodeVersions)
    .where(eq(nodeVersions.nodeId, nodeId))
    .orderBy(...versionOrderAsc)
}

/** Soft delete. Its connections are kept, and hidden while either end is deleted. */
export async function deleteNode(db: Db, nodeId: string) {
  const node = await requireNode(db, nodeId)
  if (node.deletedAt) return
  const now = new Date()
  await db.batch([
    db.update(nodes).set({ deletedAt: now }).where(eq(nodes.id, nodeId)),
    db
      .update(boards)
      .set({ updatedAt: now })
      .where(eq(boards.id, node.boardId)),
  ])
}

export async function restoreNode(db: Db, nodeId: string) {
  const node = await requireNode(db, nodeId)
  if (!node.deletedAt) return
  await db.batch([
    db.update(nodes).set({ deletedAt: null }).where(eq(nodes.id, nodeId)),
    db
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, node.boardId)),
  ])
}

/** The live, confirmed node whose latest version is newest. Null if the board has none. */
export async function mostRecentlyEditedNodeId(db: Db, boardId: string) {
  const [row] = await db
    .select({ nodeId: nodeVersions.nodeId })
    .from(nodeVersions)
    .innerJoin(nodes, eq(nodes.id, nodeVersions.nodeId))
    .where(
      and(
        eq(nodes.boardId, boardId),
        isNull(nodes.deletedAt),
        eq(nodes.status, "confirmed")
      )
    )
    .orderBy(...versionOrderDesc)
    .limit(1)
  return row?.nodeId ?? null
}

// ---------- Connections (cross-links) ----------

/** Owner-made cross-link. Returns the existing link if an identical live one exists. */
export async function connectNodes(db: Db, input: ConnectInput) {
  if (input.fromNodeId === input.toNodeId) {
    throw new BoardError("INVALID", "A node cannot be linked to itself")
  }
  await requireLiveBoard(db, input.boardId)
  const ends = await db
    .select()
    .from(nodes)
    .where(
      and(
        inArray(nodes.id, [input.fromNodeId, input.toNodeId]),
        isNull(nodes.deletedAt)
      )
    )
  if (ends.length !== 2)
    throw new BoardError(
      "NOT_FOUND",
      "Both nodes must exist and not be deleted"
    )
  if (ends.some((n) => n.boardId !== input.boardId)) {
    throw new BoardError("INVALID", "Both nodes must belong to this board")
  }

  const [existing] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.fromNodeId, input.fromNodeId),
        eq(connections.toNodeId, input.toNodeId),
        eq(connections.kind, input.kind),
        isNull(connections.deletedAt)
      )
    )
    .limit(1)
  if (existing) return existing

  const now = new Date()
  const [[connection]] = await db.batch([
    db
      .insert(connections)
      .values({ ...input, createdBy: "owner", createdAt: now })
      .returning(),
    db
      .update(boards)
      .set({ updatedAt: now })
      .where(eq(boards.id, input.boardId)),
  ])
  return connection
}

/** Soft-delete a cross-link. Branch ("child") links go away with their node instead. */
export async function disconnect(db: Db, connectionId: string) {
  const connection = await requireConnection(db, connectionId)
  if (connection.kind === "child") {
    throw new BoardError(
      "INVALID",
      "Branch links can't be removed directly; delete the node"
    )
  }
  if (connection.deletedAt) return
  const now = new Date()
  await db.batch([
    db
      .update(connections)
      .set({ deletedAt: now })
      .where(eq(connections.id, connectionId)),
    db
      .update(boards)
      .set({ updatedAt: now })
      .where(eq(boards.id, connection.boardId)),
  ])
}

export async function restoreConnection(db: Db, connectionId: string) {
  const connection = await requireConnection(db, connectionId)
  if (!connection.deletedAt) return
  await db.batch([
    db
      .update(connections)
      .set({ deletedAt: null })
      .where(eq(connections.id, connectionId)),
    db
      .update(boards)
      .set({ updatedAt: new Date() })
      .where(eq(boards.id, connection.boardId)),
  ])
}

// ---------- Lookups ----------

async function requireBoard(db: Db, boardId: string) {
  const [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1)
  if (!board) throw new BoardError("NOT_FOUND", "Board not found")
  return board
}

async function requireLiveBoard(db: Db, boardId: string) {
  const board = await requireBoard(db, boardId)
  if (board.deletedAt) throw new BoardError("NOT_FOUND", "Board not found")
  return board
}

async function requireNode(db: Db, nodeId: string) {
  const [node] = await db
    .select()
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1)
  if (!node) throw new BoardError("NOT_FOUND", "Node not found")
  return node
}

async function requireLiveNode(db: Db, nodeId: string) {
  const node = await requireNode(db, nodeId)
  if (node.deletedAt) throw new BoardError("NOT_FOUND", "Node not found")
  return node
}

async function requireConnection(db: Db, connectionId: string) {
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .limit(1)
  if (!connection) throw new BoardError("NOT_FOUND", "Connection not found")
  return connection
}
