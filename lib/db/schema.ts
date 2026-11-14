import { sql } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/*
 * Engram data model (SPEC.md sections 5 and 9).
 *
 * Rules the schema enforces or supports:
 * - Node text lives only in node_versions, which is append-only
 *   (database triggers in the custom migration block UPDATE and DELETE).
 * - Nothing is hard-deleted: nodes, connections and boards carry deleted_at.
 * - Every node, version and connection records whether the owner or the AI made it.
 * - Each node has at most one live parent (one live "child" connection pointing at it),
 *   which keeps the graph a tree plus cross-links.
 */

export const NODE_TYPES = [
  "thought",
  "question",
  "assumption",
  "evidence",
  "objection",
  "defense",
  "verdict",
] as const
export type NodeType = (typeof NODE_TYPES)[number]

export const AUTHORS = ["owner", "ai"] as const
export type Author = (typeof AUTHORS)[number]

/** "suggested" = an AI proposal shown as a ghost until the owner accepts it. */
export const STATUSES = ["confirmed", "suggested"] as const
export type Status = (typeof STATUSES)[number]

export const CONNECTION_KINDS = [
  "child",
  "related",
  "supports",
  "contradicts",
  "depends-on",
] as const
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())

const deletedAt = () => integer("deleted_at", { mode: "timestamp_ms" })

export const boards = sqliteTable(
  "boards",
  {
    id: id(),
    /** The "I am thinking about..." line. */
    title: text("title").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: deletedAt(),
  },
  (t) => [index("boards_updated_at_idx").on(t.updatedAt)]
)

export const nodes = sqliteTable(
  "nodes",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    /** Optional label; a node starts as plain text. */
    type: text("type", { enum: NODE_TYPES }),
    createdBy: text("created_by", { enum: AUTHORS }).notNull(),
    status: text("status", { enum: STATUSES }).notNull().default("confirmed"),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("nodes_board_idx").on(t.boardId)]
)

export const nodeVersions = sqliteTable(
  "node_versions",
  {
    id: id(),
    nodeId: text("node_id")
      .notNull()
      .references(() => nodes.id),
    text: text("text").notNull(),
    /** Optional "why this changed". */
    note: text("note"),
    author: text("author", { enum: AUTHORS }).notNull(),
    /** True when saved automatically on leaving the node, not by an explicit Revise. */
    autoSaved: integer("auto_saved", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [index("node_versions_node_created_idx").on(t.nodeId, t.createdAt)]
)

export const connections = sqliteTable(
  "connections",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    fromNodeId: text("from_node_id")
      .notNull()
      .references(() => nodes.id),
    toNodeId: text("to_node_id")
      .notNull()
      .references(() => nodes.id),
    kind: text("kind", { enum: CONNECTION_KINDS }).notNull(),
    createdBy: text("created_by", { enum: AUTHORS }).notNull(),
    status: text("status", { enum: STATUSES }).notNull().default("confirmed"),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("connections_board_idx").on(t.boardId),
    index("connections_from_idx").on(t.fromNodeId),
    index("connections_to_idx").on(t.toNodeId),
    // At most one live parent per node.
    uniqueIndex("connections_one_parent_idx")
      .on(t.toNodeId)
      .where(sql`${t.kind} = 'child' AND ${t.deletedAt} IS NULL`),
  ]
)

export const DELETABLE_ENTITIES = ["board", "node", "connection"] as const
export type DeletableEntity = (typeof DELETABLE_ENTITIES)[number]

export const DELETION_ACTIONS = ["deleted", "restored"] as const
export type DeletionAction = (typeof DELETION_ACTIONS)[number]

/**
 * Append-only history of every delete and restore, for timeline replay.
 * Written automatically by database triggers whenever deleted_at changes on
 * boards, nodes or connections; app code never inserts here directly
 * (except when importing a board with its history).
 */
export const deletionEvents = sqliteTable(
  "deletion_events",
  {
    id: id(),
    entityType: text("entity_type", { enum: DELETABLE_ENTITIES }).notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action", { enum: DELETION_ACTIONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("deletion_events_entity_idx").on(
      t.entityType,
      t.entityId,
      t.createdAt
    ),
  ]
)

export type Board = typeof boards.$inferSelect
export type Node = typeof nodes.$inferSelect
export type NodeVersion = typeof nodeVersions.$inferSelect
export type Connection = typeof connections.$inferSelect
export type DeletionEvent = typeof deletionEvents.$inferSelect
