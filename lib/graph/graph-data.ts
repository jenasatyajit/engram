import { nodeLabel } from "@/lib/board/labels"
import type { BoardView } from "@/lib/board/repo"
import { stanceOf } from "@/lib/critic/stance"
import type { ConnectionKind, NodeType, Stance } from "@/lib/db/schema"

/** One dot in the graph. */
export type GraphNode = {
  id: string
  label: string
  /** The label is an AI-written title (shown with a marker). */
  aiTitle: boolean
  type: NodeType | null
  versionCount: number
  /** Number of live links touching this node; drives the dot size. */
  degree: number
  /** Branch depth from its root (roots are 0); drives the Tree layout. */
  depth: number
}

/** One line in the graph. `source`/`target` are node ids (the library swaps in objects). */
export type GraphLink = {
  id: string
  source: string
  target: string
  kind: ConnectionKind
  /** Branch links only: the child's stance towards its parent (Critic, SPEC.md 8). */
  stance?: Stance
}

export type GraphData = { nodes: GraphNode[]; links: GraphLink[] }

/** Build graph data from a board. Only live nodes and links between them are included. */
export function toGraphData(view: BoardView | null): GraphData {
  if (!view) return { nodes: [], links: [] }

  const parentOf = new Map(view.nodes.map((n) => [n.id, n.parentId]))
  const depthCache = new Map<string, number>()
  const depthOf = (id: string): number => {
    const cached = depthCache.get(id)
    if (cached !== undefined) return cached
    // Walk up to the root; the seen-set guards against bad data forming a loop.
    let depth = 0
    let cursor = parentOf.get(id) ?? null
    const seen = new Set([id])
    while (cursor && !seen.has(cursor) && parentOf.has(cursor)) {
      seen.add(cursor)
      depth++
      cursor = parentOf.get(cursor) ?? null
    }
    depthCache.set(id, depth)
    return depth
  }

  const typeOf = new Map(view.nodes.map((n) => [n.id, n.type]))
  const degree = new Map<string, number>()
  for (const c of view.connections) {
    degree.set(c.fromNodeId, (degree.get(c.fromNodeId) ?? 0) + 1)
    degree.set(c.toNodeId, (degree.get(c.toNodeId) ?? 0) + 1)
  }

  return {
    nodes: view.nodes.map((n) => ({
      id: n.id,
      label: nodeLabel(n, 26),
      aiTitle: n.titleSource === "ai",
      type: n.type,
      versionCount: n.versionCount,
      degree: degree.get(n.id) ?? 0,
      depth: depthOf(n.id),
    })),
    links: view.connections.map((c) => {
      const stance =
        c.kind === "child" ? stanceOf(typeOf.get(c.toNodeId) ?? null) : null
      return {
        id: c.id,
        source: c.fromNodeId,
        target: c.toNodeId,
        kind: c.kind,
        ...(stance ? { stance } : {}),
      }
    }),
  }
}

/** Node id -> ids of every node it is linked to (either direction). */
export function neighbourMap(data: GraphData) {
  const map = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set())
    map.get(a)!.add(b)
  }
  for (const l of data.links) {
    add(l.source, l.target)
    add(l.target, l.source)
  }
  return map
}

/** Dot radius in graph units: grows gently with the number of links, like Obsidian. */
export function nodeRadius(degree: number) {
  return 4 + Math.sqrt(degree) * 1.8
}
