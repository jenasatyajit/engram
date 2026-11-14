import { and, desc, eq, inArray, isNull } from "drizzle-orm"

import { BoardError, connectNodes, createAiArgument } from "@/lib/board/repo"
import {
  aiFindings,
  aiReviews,
  boards,
  nodes,
  type AiFinding,
  type ArgumentProposal,
  type FindingKind,
} from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

import type { DismissedSummary } from "./context"
import { argumentNodeText } from "./format"
import { argumentTypeFor } from "./stance"

/*
 * Storage for Critic reviews and findings (SPEC.md 6.2, 7.4, D24).
 * A finding stays pending until the owner adds/links/acknowledges it (accepted)
 * or dismisses it. A newer review supersedes the older pending findings.
 */

/** A finding as the UI sees it. */
export type FindingView = {
  id: string
  kind: FindingKind
  message: string
  nodeIds: string[]
  argument: ArgumentProposal | null
  createdAt: Date
}

export type NewFinding = {
  kind: FindingKind
  message: string
  nodeIds: string[]
  argument: ArgumentProposal | null
  fingerprint: string
}

const toView = (f: AiFinding): FindingView => ({
  id: f.id,
  kind: f.kind,
  message: f.message,
  nodeIds: f.nodeIds,
  argument: f.argument ?? null,
  createdAt: f.createdAt,
})

/** Ids of the board's live nodes. */
export async function liveNodeIds(db: Db, boardId: string) {
  const rows = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.boardId, boardId), isNull(nodes.deletedAt)))
  return new Set(rows.map((r) => r.id))
}

const referencesLiveNodes = (
  f: { nodeIds: string[]; argument: ArgumentProposal | null },
  live: Set<string>
) =>
  f.nodeIds.every((id) => live.has(id)) &&
  (!f.argument || live.has(f.argument.parentNodeId))

/** Pending findings whose nodes all still exist, newest review first, in the model's order. */
export async function listFindings(
  db: Db,
  boardId: string
): Promise<FindingView[]> {
  const [rows, live] = await Promise.all([
    db
      .select()
      .from(aiFindings)
      .where(
        and(eq(aiFindings.boardId, boardId), eq(aiFindings.status, "pending"))
      )
      .orderBy(desc(aiFindings.createdAt)),
    liveNodeIds(db, boardId),
  ])
  return rows
    .filter((f) =>
      referencesLiveNodes(
        { nodeIds: f.nodeIds, argument: f.argument ?? null },
        live
      )
    )
    .map(toView)
}

/** Everything the owner dismissed on this board, for the prompt and the hash. */
export async function dismissedFindings(db: Db, boardId: string) {
  const rows = await db
    .select({
      fingerprint: aiFindings.fingerprint,
      kind: aiFindings.kind,
      nodeIds: aiFindings.nodeIds,
      message: aiFindings.message,
      argument: aiFindings.argument,
    })
    .from(aiFindings)
    .where(
      and(eq(aiFindings.boardId, boardId), eq(aiFindings.status, "dismissed"))
    )
    .orderBy(aiFindings.createdAt)
  return rows.map((r): DismissedSummary & { fingerprint: string } => ({
    fingerprint: r.fingerprint,
    kind: r.kind,
    nodeIds: r.nodeIds,
    summary: r.argument
      ? `${r.argument.stance}: ${r.argument.title}`
      : r.message,
  }))
}

/** Content hash of the last successful review, or null. */
export async function lastReviewHash(db: Db, boardId: string) {
  const [row] = await db
    .select({ hash: aiReviews.contentHash })
    .from(aiReviews)
    .where(and(eq(aiReviews.boardId, boardId), eq(aiReviews.status, "ok")))
    .orderBy(desc(aiReviews.createdAt))
    .limit(1)
  return row?.hash ?? null
}

export type ReviewRecord = {
  boardId: string
  contentHash: string
  focusNodeId: string | null
  status: "ok" | "failed"
  errorCode?: string | null
  modelCalls: number
  searches: number
  durationMs: number
}

/**
 * Store a review. A successful one replaces the board's pending findings with the new
 * ones, dropping any that point at nodes deleted while the AI was thinking.
 */
export async function saveReview(
  db: Db,
  record: ReviewRecord,
  findings: NewFinding[] = []
): Promise<FindingView[]> {
  const reviewId = crypto.randomUUID()
  const now = new Date()
  const live =
    record.status === "ok"
      ? await liveNodeIds(db, record.boardId)
      : new Set<string>()
  const kept = findings.filter((f) => referencesLiveNodes(f, live))

  const insertReview = db.insert(aiReviews).values({
    id: reviewId,
    boardId: record.boardId,
    contentHash: record.contentHash,
    focusNodeId: record.focusNodeId,
    status: record.status,
    errorCode: record.errorCode ?? null,
    modelCalls: record.modelCalls,
    searches: record.searches,
    findingCount: kept.length,
    durationMs: record.durationMs,
    createdAt: now,
  })

  if (record.status !== "ok") {
    await insertReview
    return []
  }

  // The first finding gets the latest timestamp, so newest-first lists keep the model's order.
  const rows = kept.map((f, i) => ({
    id: crypto.randomUUID(),
    boardId: record.boardId,
    reviewId,
    kind: f.kind,
    message: f.message,
    nodeIds: f.nodeIds,
    argument: f.argument,
    fingerprint: f.fingerprint,
    status: "pending" as const,
    createdAt: new Date(now.getTime() - i),
  }))

  const supersede = db
    .update(aiFindings)
    .set({ status: "superseded", resolvedAt: now })
    .where(
      and(
        eq(aiFindings.boardId, record.boardId),
        eq(aiFindings.status, "pending")
      )
    )

  if (rows.length) {
    await db.batch([
      insertReview,
      supersede,
      db.insert(aiFindings).values(rows),
    ])
  } else {
    await db.batch([insertReview, supersede])
  }
  return rows.map((r) =>
    toView({
      ...r,
      resultNodeId: null,
      resultConnectionId: null,
      resolvedAt: null,
    })
  )
}

// ---------- Owner actions ----------

export type AcceptResult = {
  kind: FindingKind
  /** The node created for an accepted new argument. */
  nodeId: string | null
  /** The link created for an accepted duplicate or contradiction. */
  connectionId: string | null
}

/** Move a pending finding to a final status. Returns false if it was no longer pending. */
async function claim(
  db: Db,
  findingId: string,
  status: "accepted" | "dismissed"
) {
  const rows = await db
    .update(aiFindings)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(aiFindings.id, findingId), eq(aiFindings.status, "pending")))
    .returning({ id: aiFindings.id })
  return rows.length > 0
}

async function requireFinding(db: Db, findingId: string) {
  const [finding] = await db
    .select()
    .from(aiFindings)
    .where(eq(aiFindings.id, findingId))
    .limit(1)
  if (!finding)
    throw new BoardError("NOT_FOUND", "That suggestion no longer exists.")
  const [board] = await db
    .select({ deletedAt: boards.deletedAt })
    .from(boards)
    .where(eq(boards.id, finding.boardId))
    .limit(1)
  if (!board || board.deletedAt)
    throw new BoardError("NOT_FOUND", "Board not found")
  return finding
}

/**
 * Accept a finding (SPEC.md principle 3: nothing reaches the board without this step).
 * - new_argument: adds the argument as an AI-written evidence/objection/defense node.
 * - duplicate / contradiction: adds a `related` / `contradicts` link made by the AI.
 * - weak_support / hint: acknowledged; nothing is written to the board.
 */
export async function acceptFinding(
  db: Db,
  findingId: string
): Promise<AcceptResult> {
  const finding = await requireFinding(db, findingId)
  if (finding.status !== "pending") {
    throw new BoardError("INVALID", "That suggestion was already handled.")
  }

  // Check the nodes it needs before claiming it, so a stale finding stays visible with an error.
  const needed =
    finding.kind === "new_argument" && finding.argument
      ? [finding.argument.parentNodeId]
      : finding.kind === "duplicate" || finding.kind === "contradiction"
        ? finding.nodeIds.slice(0, 2)
        : []
  const parentRows = needed.length
    ? await db
        .select({ id: nodes.id, type: nodes.type })
        .from(nodes)
        .where(
          and(
            inArray(nodes.id, needed),
            eq(nodes.boardId, finding.boardId),
            isNull(nodes.deletedAt)
          )
        )
    : []
  if (parentRows.length !== new Set(needed).size) {
    throw new BoardError(
      "NOT_FOUND",
      "A thought this suggestion is about was deleted."
    )
  }

  if (!(await claim(db, findingId, "accepted"))) {
    throw new BoardError("INVALID", "That suggestion was already handled.")
  }

  try {
    if (finding.kind === "new_argument" && finding.argument) {
      const arg = finding.argument
      const parent = parentRows[0]
      const { nodeId } = await createAiArgument(db, {
        boardId: finding.boardId,
        parentId: arg.parentNodeId,
        type: argumentTypeFor(arg.stance, parent.type),
        title: arg.title,
        text: argumentNodeText(arg),
      })
      await db
        .update(aiFindings)
        .set({ resultNodeId: nodeId })
        .where(eq(aiFindings.id, findingId))
      return { kind: finding.kind, nodeId, connectionId: null }
    }

    if (finding.kind === "duplicate" || finding.kind === "contradiction") {
      const [fromNodeId, toNodeId] = finding.nodeIds
      const connection = await connectNodes(
        db,
        {
          boardId: finding.boardId,
          fromNodeId,
          toNodeId,
          kind: finding.kind === "duplicate" ? "related" : "contradicts",
        },
        "ai"
      )
      await db
        .update(aiFindings)
        .set({ resultConnectionId: connection.id })
        .where(eq(aiFindings.id, findingId))
      return { kind: finding.kind, nodeId: null, connectionId: connection.id }
    }

    return { kind: finding.kind, nodeId: null, connectionId: null }
  } catch (error) {
    // Writing to the board failed: put the finding back so the owner can retry.
    await db
      .update(aiFindings)
      .set({ status: "pending", resolvedAt: null })
      .where(eq(aiFindings.id, findingId))
      .catch((revertError: unknown) =>
        console.error(
          "[critic] could not restore finding after a failed accept",
          findingId,
          revertError
        )
      )
    throw error
  }
}

/** Dismiss a finding; it is remembered so the AI does not raise it again. */
export async function dismissFinding(db: Db, findingId: string) {
  const finding = await requireFinding(db, findingId)
  if (finding.status === "dismissed") return
  if (finding.status !== "pending") {
    throw new BoardError("INVALID", "That suggestion was already handled.")
  }
  if (!(await claim(db, findingId, "dismissed"))) {
    throw new BoardError("INVALID", "That suggestion was already handled.")
  }
}
