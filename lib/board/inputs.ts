import { z } from "zod"

import { CONNECTION_KINDS, NODE_TYPES } from "@/lib/db/schema"

/*
 * Input schemas for every board operation. Server actions parse untrusted
 * input with these before calling the domain functions (SPEC.md section 11).
 */

export const LIMITS = {
  title: 200,
  nodeText: 20_000,
  note: 500,
} as const

const id = z.uuid()

const title = z.string().trim().max(LIMITS.title)

const nodeText = z
  .string()
  .max(LIMITS.nodeText)
  .refine((s) => s.trim().length > 0, "Text cannot be empty")

const note = z.string().trim().max(LIMITS.note).optional()

/** Kinds the owner can create by hand. "child" links only come from branching. */
export const CROSS_LINK_KINDS = [
  "related",
  "supports",
  "contradicts",
  "depends-on",
] as const satisfies readonly Exclude<
  (typeof CONNECTION_KINDS)[number],
  "child"
>[]
export type CrossLinkKind = (typeof CROSS_LINK_KINDS)[number]

export const createBoardInput = z.object({
  title,
  /** Optional first thought; becomes the board's first (root) node. */
  firstText: nodeText.optional(),
})

export const renameBoardInput = z.object({ boardId: id, title })

export const boardIdInput = z.object({ boardId: id })

export const createNodeInput = z.object({
  boardId: id,
  text: nodeText,
  /**
   * Parent to branch from.
   * - omitted: attach to the most recently edited node (or make a root if the board is empty)
   * - null: make a new root
   */
  parentId: id.nullable().optional(),
  type: z.enum(NODE_TYPES).nullable().optional(),
})

export const reviseNodeInput = z.object({
  nodeId: id,
  text: nodeText,
  note,
  /** Saved automatically on leaving the node, rather than by an explicit Revise. */
  autoSaved: z.boolean().optional(),
})

export const setNodeTypeInput = z.object({
  nodeId: id,
  type: z.enum(NODE_TYPES).nullable(),
})

export const nodeIdInput = z.object({ nodeId: id })

export const connectInput = z.object({
  boardId: id,
  fromNodeId: id,
  toNodeId: id,
  kind: z.enum(CROSS_LINK_KINDS),
})

export const connectionIdInput = z.object({ connectionId: id })

export type CreateBoardInput = z.infer<typeof createBoardInput>
export type CreateNodeInput = z.infer<typeof createNodeInput>
export type ReviseNodeInput = z.infer<typeof reviseNodeInput>
export type ConnectInput = z.infer<typeof connectInput>

export const listBoardsInput = z.object({})
