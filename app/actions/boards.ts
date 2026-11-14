"use server"

import type { z } from "zod"

import * as inputs from "@/lib/board/inputs"
import * as repo from "@/lib/board/repo"
import { db } from "@/lib/db/client"

/*
 * Server actions: the only way the browser reaches the database (SPEC.md section 9).
 * Each one validates its input, runs the domain function, and returns a result
 * object instead of throwing, so the UI can show errors without crashing.
 */

export type ActionError = {
  code: "INVALID_INPUT" | repo.BoardErrorCode | "SERVER_ERROR"
  message: string
}
export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError }

async function run<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (parsed: z.infer<S>) => Promise<T>
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
    }
  }
  try {
    return { ok: true, data: await fn(parsed.data) }
  } catch (error) {
    if (error instanceof repo.BoardError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    console.error("[boards action]", error)
    return {
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: "Something went wrong saving that.",
      },
    }
  }
}

// ---------- Boards ----------

export async function createBoard(input: unknown) {
  return run(inputs.createBoardInput, input, (i) => repo.createBoard(db, i))
}

export async function renameBoard(input: unknown) {
  return run(inputs.renameBoardInput, input, (i) =>
    repo.renameBoard(db, i.boardId, i.title)
  )
}

export async function listBoards() {
  return run(inputs.listBoardsInput, {}, () => repo.listBoards(db))
}

export async function getBoard(input: unknown) {
  return run(inputs.boardIdInput, input, (i) => repo.getBoard(db, i.boardId))
}

export async function deleteBoard(input: unknown) {
  return run(inputs.boardIdInput, input, (i) => repo.deleteBoard(db, i.boardId))
}

export async function restoreBoard(input: unknown) {
  return run(inputs.boardIdInput, input, (i) =>
    repo.restoreBoard(db, i.boardId)
  )
}

// ---------- Nodes ----------

/** Capture or branch. Omit parentId to attach to the most recently edited node. */
export async function createNode(input: unknown) {
  return run(inputs.createNodeInput, input, (i) => repo.createNode(db, i))
}

/** Revise: call when the owner leaves a node. No-op if the text didn't change. */
export async function reviseNode(input: unknown) {
  return run(inputs.reviseNodeInput, input, (i) => repo.reviseNode(db, i))
}

export async function setNodeType(input: unknown) {
  return run(inputs.setNodeTypeInput, input, (i) =>
    repo.setNodeType(db, i.nodeId, i.type)
  )
}

export async function getNodeHistory(input: unknown) {
  return run(inputs.nodeIdInput, input, (i) =>
    repo.getNodeHistory(db, i.nodeId)
  )
}

export async function deleteNode(input: unknown) {
  return run(inputs.nodeIdInput, input, (i) => repo.deleteNode(db, i.nodeId))
}

export async function restoreNode(input: unknown) {
  return run(inputs.nodeIdInput, input, (i) => repo.restoreNode(db, i.nodeId))
}

// ---------- Connections ----------

export async function connectNodes(input: unknown) {
  return run(inputs.connectInput, input, (i) => repo.connectNodes(db, i))
}

export async function disconnect(input: unknown) {
  return run(inputs.connectionIdInput, input, (i) =>
    repo.disconnect(db, i.connectionId)
  )
}

export async function restoreConnection(input: unknown) {
  return run(inputs.connectionIdInput, input, (i) =>
    repo.restoreConnection(db, i.connectionId)
  )
}
