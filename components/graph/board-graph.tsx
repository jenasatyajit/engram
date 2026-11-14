"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { forceCollide, forceX, forceY } from "d3-force"
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d"

import {
  neighbourMap,
  nodeRadius,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from "@/lib/graph/graph-data"

/*
 * Obsidian-style force graph of one board (SPEC.md section 8, D14).
 * Physics mirrors Obsidian's four forces: center (forceX/forceY), repel (charge),
 * link force and link distance. Positions are not saved; the layout re-settles each time.
 * Loaded only in the browser (canvas needs `window`); see graph-screen.tsx.
 */

export type GraphLayout = "free" | "tree"

type N = NodeObject<GraphNode>
type L = LinkObject<GraphNode, GraphLink>
type Methods = ForceGraphMethods<N, L>

/** Fitting never zooms in past this, so small boards keep Obsidian-sized dots. */
const MAX_FIT_ZOOM = 1.8

/** Vertical gap between branch levels in the Tree layout, in graph units. */
const LEVEL_GAP = 80

type Palette = {
  font: string
  node: string
  label: string
  labelStrong: string
  dimLabel: string
  accent: string
  link: Record<GraphLink["kind"], string>
  linkDim: string
}

/** Read theme colours from CSS variables so the canvas matches the app. */
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback
  const fg = v("--foreground", "oklch(0.985 0 0)")
  const accent = v("--graph-accent", "oklch(0.86 0.19 125)")
  const withAlpha = (color: string, alpha: number) =>
    color.startsWith("oklch(") ? color.replace(/\)$/, ` / ${alpha})`) : color
  return {
    font: getComputedStyle(document.body).fontFamily,
    node: withAlpha(fg, 0.78),
    label: withAlpha(fg, 0.75),
    labelStrong: fg,
    dimLabel: withAlpha(fg, 0.18),
    accent,
    link: {
      child: withAlpha(fg, 0.22),
      related: withAlpha(fg, 0.14),
      "depends-on": withAlpha(fg, 0.32),
      supports: "oklch(0.74 0.14 155 / 0.75)",
      contradicts: "oklch(0.68 0.19 25 / 0.8)",
    },
    linkDim: withAlpha(fg, 0.05),
  }
}

/** Link ends start as ids; the library replaces them with node objects. */
const idOf = (end: unknown) =>
  typeof end === "object" && end !== null
    ? String((end as { id?: unknown }).id)
    : String(end)

export default function BoardGraph({
  data,
  currentNodeId,
  layout,
  fitRequest,
  onOpenNode,
}: {
  data: GraphData
  currentNodeId: string | null
  layout: GraphLayout
  /** Change this number to zoom the view to fit all nodes. */
  fitRequest: number
  onOpenNode: (nodeId: string) => void
}) {
  const fgRef = useRef<Methods | undefined>(undefined)
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  // This component only ever renders in the browser (ssr: false), so reading CSS here is safe.
  const [palette] = useState<Palette>(readPalette)
  const fittedOnce = useRef(false)

  // The library mutates node/link objects (adds x, y, ...), so give it its own copies.
  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })) as N[],
      links: data.links.map((l) => ({ ...l })) as L[],
    }),
    [data]
  )
  const neighbours = useMemo(() => neighbourMap(data), [data])
  const active = hoverId
    ? new Set([hoverId, ...(neighbours.get(hoverId) ?? [])])
    : null

  // Fill the container.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Forces. Re-applied (and the simulation reheated) when the layout changes.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !size.width) return

    const charge = fg.d3Force("charge")
    charge?.strength?.(-110)
    charge?.distanceMax?.(420)

    const link = fg.d3Force("link")
    // Obsidian-like default: links between busy nodes pull less (1 / smaller degree).
    // Tree layout: longer, looser links so levels and spacing decide positions.
    const degreeOf = (end: unknown) =>
      typeof end === "object" && end !== null ? ((end as N).degree ?? 1) : 1
    link?.distance?.((l: L) =>
      layout === "tree" ? LEVEL_GAP * 1.3 : l.kind === "child" ? 42 : 70
    )
    link?.strength?.((l: L) =>
      layout === "tree"
        ? 0.15
        : 1 / Math.max(1, Math.min(degreeOf(l.source), degreeOf(l.target)))
    )

    fg.d3Force("center", null)
    fg.d3Force(
      "collide",
      forceCollide<N>((n) => nodeRadius(n.degree) + 6) as never
    )

    if (layout === "tree") {
      const maxDepth = Math.max(0, ...graphData.nodes.map((n) => n.depth))
      const offset = (maxDepth * LEVEL_GAP) / 2
      fg.d3Force("x", forceX<N>(0).strength(0.03) as never)
      fg.d3Force(
        "y",
        forceY<N>((n) => n.depth * LEVEL_GAP - offset).strength(0.9) as never
      )
    } else {
      fg.d3Force("x", forceX<N>(0).strength(0.06) as never)
      fg.d3Force("y", forceY<N>(0).strength(0.06) as never)
    }

    fittedOnce.current = false
    fg.d3ReheatSimulation()
  }, [layout, graphData, size.width])

  /** Zoom to show every node, without zooming a small board in too far. */
  const fit = (ms: number) => {
    const fg = fgRef.current
    if (!fg) return
    fg.zoomToFit(ms, 60)
    setTimeout(() => {
      if (fg.zoom() > MAX_FIT_ZOOM) fg.zoom(MAX_FIT_ZOOM, 250)
    }, ms + 20)
  }

  useEffect(() => {
    if (fitRequest > 0) fit(400)
  }, [fitRequest])

  // Test hook: lets the browser e2e script find a node on the canvas. Only in e2e builds.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E !== "1") return
    const w = window as unknown as { __engramGraph?: unknown }
    w.__engramGraph = {
      nodes: () =>
        graphData.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          depth: n.depth,
        })),
      screenOf: (id: string) => {
        const n = graphData.nodes.find((x) => x.id === id)
        const fg = fgRef.current
        const box = boxRef.current?.getBoundingClientRect()
        if (!n || !fg || !box || n.x === undefined || n.y === undefined)
          return null
        const p = fg.graph2ScreenCoords(n.x, n.y)
        return { x: box.left + p.x, y: box.top + p.y }
      },
    }
    return () => {
      delete w.__engramGraph
    }
  }, [graphData])

  return (
    <div ref={boxRef} className="absolute inset-0" data-testid="board-graph">
      {size.width > 0 && (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          graphData={graphData}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          minZoom={0.2}
          maxZoom={8}
          d3AlphaDecay={0.025}
          d3VelocityDecay={0.35}
          cooldownTime={6000}
          onEngineStop={() => {
            if (fittedOnce.current) return
            fittedOnce.current = true
            fit(500)
          }}
          onNodeHover={(n) => setHoverId(n ? String(n.id) : null)}
          onNodeClick={(n) => onOpenNode(String(n.id))}
          onBackgroundClick={() => setHoverId(null)}
          nodeLabel={() => ""}
          nodeCanvasObject={(n, ctx, scale) => {
            const id = String(n.id)
            const r = nodeRadius(n.degree)
            const focused = id === hoverId
            const dim = active ? !active.has(id) : false
            const isCurrent = id === currentNodeId
            const x = n.x ?? 0
            const y = n.y ?? 0

            // Dot.
            ctx.beginPath()
            ctx.arc(x, y, r, 0, 2 * Math.PI)
            ctx.fillStyle =
              focused || (isCurrent && !active) ? palette.accent : palette.node
            ctx.globalAlpha = dim ? 0.22 : 1
            ctx.fill()
            if (isCurrent) {
              ctx.lineWidth = 1.5 / scale
              ctx.strokeStyle = palette.accent
              ctx.beginPath()
              ctx.arc(x, y, r + 3 / scale + 1.5, 0, 2 * Math.PI)
              ctx.stroke()
            }

            // Label: fades in as you zoom; hovered node and neighbours always show.
            const highlighted = active?.has(id) ?? false
            const zoomAlpha = Math.min(1, Math.max(0, (scale - 0.7) / 0.6))
            const labelAlpha = highlighted ? 1 : dim ? 0 : zoomAlpha
            if (labelAlpha > 0.02) {
              const fontSize = 12 / scale
              ctx.globalAlpha = labelAlpha
              ctx.font = `${focused ? 600 : 400} ${fontSize}px ${palette.font}`
              ctx.textAlign = "center"
              ctx.textBaseline = "top"
              ctx.fillStyle = highlighted ? palette.labelStrong : palette.label
              ctx.fillText(n.label, x, y + r + 4 / scale)

              const meta = [
                n.type,
                n.versionCount > 1 ? `v${n.versionCount}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
              if (meta) {
                ctx.font = `400 ${fontSize * 0.8}px ${palette.font}`
                ctx.fillStyle = palette.dimLabel
                ctx.globalAlpha = labelAlpha * 0.9 + 0.1
                ctx.fillText(meta, x, y + r + 4 / scale + fontSize * 1.25)
              }
            }
            ctx.globalAlpha = 1
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(
              n.x ?? 0,
              n.y ?? 0,
              nodeRadius(n.degree) + 4,
              0,
              2 * Math.PI
            )
            ctx.fill()
          }}
          linkColor={(l) => {
            if (!active) return palette.link[l.kind]
            const touches =
              idOf(l.source) === hoverId || idOf(l.target) === hoverId
            return touches ? palette.accent : palette.linkDim
          }}
          linkWidth={(l) =>
            hoverId &&
            (idOf(l.source) === hoverId || idOf(l.target) === hoverId)
              ? 1.6
              : 0.8
          }
          linkLineDash={(l) => (l.kind === "contradicts" ? [4, 3] : null)}
          linkDirectionalArrowLength={(l) => (l.kind === "depends-on" ? 5 : 0)}
          linkDirectionalArrowRelPos={0.85}
        />
      )}
    </div>
  )
}
