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

export const TITLE_SOURCES = ["placeholder", "ai"] as const
export type TitleSource = (typeof TITLE_SOURCES)[number]

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
    /** Short name shown in breadcrumbs, chips, sidebar and graph. Null = use the first line. No history. */
    title: text("title"),
    /** "placeholder" = the `B#: <parent title>` name given at creation; "ai" = written by the AI. */
    titleSource: text("title_source", { enum: TITLE_SOURCES }),
    /** The version an AI title was written from, so a slow reply can't overwrite a newer title. */
    titledVersionId: text("titled_version_id"),
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

/**
 * AI calls per UTC day, for the configurable daily cap (SPEC.md 7.6, D16).
 * One row per day; incremented atomically before each AI call.
 */
export const aiUsage = sqliteTable("ai_usage", {
  day: text("day").primaryKey(),
  calls: integer("calls").notNull().default(0),
})

// ---------- Critic reviews (SPEC.md 6.2, 7.4, D24) ----------

export const FINDING_KINDS = [
  "duplicate",
  "contradiction",
  "new_argument",
  "weak_support",
  "hint",
] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

export const STANCES = ["for", "against"] as const
export type Stance = (typeof STANCES)[number]

/** superseded = replaced by a newer review before the owner acted on it. */
export const FINDING_STATUSES = [
  "pending",
  "accepted",
  "dismissed",
  "superseded",
] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

export const REVIEW_STATUSES = ["ok", "failed"] as const

/** A web source the server attached to an AI argument (never written by the model). */
export type FindingSource = {
  url: string
  title: string
  publishedAt: string | null
}

/** The ready-made argument in a `new_argument` finding. */
export type ArgumentProposal = {
  parentNodeId: string
  stance: Stance
  title: string
  text: string
  /** Empty = from the model's own knowledge ("AI knowledge, no source"). */
  sources: FindingSource[]
}

/** One AI review run: used for the "nothing changed" cache and for logging. */
export const aiReviews = sqliteTable(
  "ai_reviews",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    /** Hash of the board content the review saw (see lib/critic/context.ts). */
    contentHash: text("content_hash").notNull(),
    focusNodeId: text("focus_node_id"),
    status: text("status", { enum: REVIEW_STATUSES }).notNull(),
    errorCode: text("error_code"),
    modelCalls: integer("model_calls").notNull().default(0),
    searches: integer("searches").notNull().default(0),
    findingCount: integer("finding_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_reviews_board_created_idx").on(t.boardId, t.createdAt)]
)

/** A finding from a review, shown in the mascot panel until the owner acts on it. */
export const aiFindings = sqliteTable(
  "ai_findings",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    reviewId: text("review_id")
      .notNull()
      .references(() => aiReviews.id),
    kind: text("kind", { enum: FINDING_KINDS }).notNull(),
    /** What the mascot says (AI-written, shown as AI). */
    message: text("message").notNull(),
    /** Node ids the finding is about. */
    nodeIds: text("node_ids", { mode: "json" }).$type<string[]>().notNull(),
    argument: text("argument", { mode: "json" }).$type<ArgumentProposal>(),
    /** Stable identity across reviews, so a dismissed finding is not raised again. */
    fingerprint: text("fingerprint").notNull(),
    status: text("status", { enum: FINDING_STATUSES })
      .notNull()
      .default("pending"),
    resultNodeId: text("result_node_id"),
    resultConnectionId: text("result_connection_id"),
    createdAt: createdAt(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("ai_findings_board_status_idx").on(t.boardId, t.status),
    index("ai_findings_board_fingerprint_idx").on(t.boardId, t.fingerprint),
  ]
)

/**
 * Login (SPEC.md D23). One seeded user for now; boards are not owned by users yet.
 * password_hash is "salt:hash" (scrypt), never the password itself.
 */
export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
})

/** Server-side sessions. `id` is the SHA-256 of the cookie token, so a database leak yields no usable cookies. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    /** Last time the expiry was pushed forward (sliding session). */
    refreshedAt: integer("refreshed_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
)

/** Failed login attempts per client key (IP) in the current window, for rate limiting. */
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
})

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Board = typeof boards.$inferSelect
export type Node = typeof nodes.$inferSelect
export type NodeVersion = typeof nodeVersions.$inferSelect
export type Connection = typeof connections.$inferSelect
export type DeletionEvent = typeof deletionEvents.$inferSelect
export type AiReview = typeof aiReviews.$inferSelect
export type AiFinding = typeof aiFindings.$inferSelect
