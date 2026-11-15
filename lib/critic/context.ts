import { createHash } from "node:crypto"

import { nodeLabel } from "@/lib/board/labels"
import { mentionsToPlain } from "@/lib/board/mentions"
import type { BoardView, NodeView } from "@/lib/board/repo"
import type { FindingKind } from "@/lib/db/schema"

import { roleOf } from "./stance"

/*
 * The board as compact text for the AI (SPEC.md 7.3). Nodes get short handles
 * (N1, N2, ...) instead of UUIDs: cheaper, and the model can't mangle them.
 * The server maps handles back to real ids and rejects unknown ones.
 */

/** Longest stretch of one node's text sent to the model. */
export const MAX_NODE_CHARS = 2_000
/** Whole-context budget (~4 chars per token, well under the 128K window with room for output). */
export const MAX_CONTEXT_CHARS = 240_000

export type DismissedSummary = {
  kind: FindingKind
  nodeIds: string[]
  summary: string
}

export type BoardContext = {
  /** The text sent to the model. */
  text: string
  handleToId: Map<string, string>
  idToHandle: Map<string, string>
  approxTokens: number
  tooLarge: boolean
}

/** Roots first, then each node's branches oldest-first (depth-first), so the text reads like the tree. */
export function orderNodes(nodes: NodeView[]): NodeView[] {
  const ids = new Set(nodes.map((n) => n.id))
  const childrenOf = new Map<string | null, NodeView[]>()
  for (const n of nodes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(n)
  }
  for (const list of childrenOf.values())
    list.sort((a, b) => +a.createdAt - +b.createdAt)

  const out: NodeView[] = []
  const seen = new Set<string>()
  const visit = (n: NodeView) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    out.push(n)
    for (const c of childrenOf.get(n.id) ?? []) visit(c)
  }
  for (const root of childrenOf.get(null) ?? []) visit(root)
  // Anything left over (only possible with bad data) still gets included.
  for (const n of nodes) visit(n)
  return out
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}… [cut]` : text

/** Keep tags in owner text from closing our delimiters. */
const neutralise = (text: string) =>
  text.replace(/<\/?(board|dismissed)>/gi, "")

export function buildBoardContext(
  view: BoardView,
  focusNodeId: string | null,
  dismissed: DismissedSummary[] = []
): BoardContext {
  const ordered = orderNodes(view.nodes)
  const titles = new Map(view.nodes.map((n) => [n.id, nodeLabel(n, 60)]))
  const titleOf = (id: string) => titles.get(id)
  const handleToId = new Map<string, string>()
  const idToHandle = new Map<string, string>()
  ordered.forEach((n, i) => {
    const handle = `N${i + 1}`
    handleToId.set(handle, n.id)
    idToHandle.set(n.id, handle)
  })
  const h = (id: string | null) => (id ? (idToHandle.get(id) ?? null) : null)

  const lines: string[] = []
  lines.push("<board>")
  lines.push(
    `CLAIM (the board title, the owner's main thought): ${JSON.stringify(neutralise(view.board.title.trim() || "(untitled)"))}`
  )
  const focus = h(focusNodeId)
  lines.push(
    focus
      ? `FOCUS: ${focus} (the node the owner just left; look at it first, but review the whole board)`
      : "FOCUS: none (review the whole board)"
  )
  lines.push("")
  lines.push("NODES (handle | role | author | parent | title), then the text:")
  for (const n of ordered) {
    const parent = h(n.parentId) ?? "root"
    const author = n.createdBy === "ai" ? "AI (accepted by owner)" : "owner"
    lines.push(
      `${h(n.id)} | ${roleOf(n.type, !n.parentId)} | ${author} | parent ${parent} | ${JSON.stringify(neutralise(nodeLabel(n, 60)))}`
    )
    lines.push(
      `  ${neutralise(clip(mentionsToPlain(n.text, titleOf).trim(), MAX_NODE_CHARS)).replace(/\n/g, "\n  ")}`
    )
  }

  const crossLinks = view.connections.filter((c) => c.kind !== "child")
  if (crossLinks.length) {
    lines.push("")
    lines.push("CROSS-LINKS:")
    for (const c of crossLinks) {
      const from = h(c.fromNodeId)
      const to = h(c.toNodeId)
      if (from && to) lines.push(`${from} -${c.kind}-> ${to}`)
    }
  }
  lines.push("</board>")

  const shownDismissed = dismissed
    .map((d) => ({
      ...d,
      handles: d.nodeIds.map((id) => h(id)).filter(Boolean),
    }))
    .slice(-40)
  if (shownDismissed.length) {
    lines.push("")
    lines.push("<dismissed>")
    lines.push(
      "The owner already dismissed these findings. Do not raise them again, even reworded:"
    )
    for (const d of shownDismissed) {
      lines.push(
        `- ${d.kind} on ${d.handles.join(", ") || "board"}: ${neutralise(clip(d.summary, 200))}`
      )
    }
    lines.push("</dismissed>")
  }

  const text = lines.join("\n")
  return {
    text,
    handleToId,
    idToHandle,
    approxTokens: Math.ceil(text.length / 4),
    tooLarge: text.length > MAX_CONTEXT_CHARS,
  }
}

/**
 * Hash of everything a review depends on. Equal hash = nothing changed since the
 * last review, so the review is skipped (SPEC.md 7.6).
 */
export function boardContentHash(
  view: BoardView,
  dismissedFingerprints: string[]
) {
  const payload = {
    title: view.board.title,
    nodes: [...view.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => [n.id, n.parentId, n.type, n.createdBy, n.text]),
    links: view.connections
      .filter((c) => c.kind !== "child")
      .map((c) => [c.fromNodeId, c.toNodeId, c.kind])
      .sort(),
    dismissed: [...dismissedFingerprints].sort(),
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

/** Stable identity of a finding across reviews (kind + nodes + argument gist). */
export function findingFingerprint(input: {
  kind: FindingKind
  nodeIds: string[]
  argumentTitle?: string | null
  stance?: string | null
}) {
  const gist = (input.argumentTitle ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const key = [
    input.kind,
    [...input.nodeIds].sort().join(","),
    input.stance ?? "",
    gist,
  ].join("|")
  return createHash("sha256").update(key).digest("hex").slice(0, 32)
}
