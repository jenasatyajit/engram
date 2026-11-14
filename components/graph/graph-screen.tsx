"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowExpand01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEditor } from "@/lib/editor/provider"
import { anchorNodeId } from "@/lib/editor/store"
import { toGraphData } from "@/lib/graph/graph-data"

import type { GraphLayout } from "./board-graph"

// Canvas + d3 need the browser, so the graph is never server-rendered.
const BoardGraph = dynamic(() => import("./board-graph"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 animate-pulse rounded-3xl bg-muted/20" />
  ),
})

/** Full graph of the board, shown in place of the editor. */
export function GraphScreen() {
  const view = useEditor((s) => s.view)
  const target = useEditor((s) => s.target)
  const openFromGraph = useEditor((s) => s.openFromGraph)
  const showEditor = useEditor((s) => s.showEditor)
  const [layout, setLayout] = useState<GraphLayout>("free")
  const [fitRequest, setFitRequest] = useState(0)

  const data = useMemo(() => toGraphData(view), [view])

  // Esc goes back to the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) showEditor()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showEditor])

  return (
    <section
      aria-label="Board graph"
      className="relative min-h-[60svh] min-w-0 flex-1 overflow-hidden rounded-3xl border border-border bg-black/15"
    >
      {data.nodes.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-xs text-muted-foreground">
            No thoughts yet. Start writing and they&apos;ll show up here.
          </p>
          <Button variant="outline" onClick={showEditor}>
            Back to writing
          </Button>
        </div>
      ) : (
        <BoardGraph
          data={data}
          currentNodeId={anchorNodeId(target)}
          layout={layout}
          fitRequest={fitRequest}
          onOpenNode={(nodeId) => openFromGraph(nodeId)}
        />
      )}

      {data.nodes.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <ToggleGroup
              value={[layout]}
              onValueChange={(value) => {
                const next = value[0] as GraphLayout | undefined
                if (next) setLayout(next)
              }}
              spacing={0}
              aria-label="Graph layout"
              className="rounded-full border border-border bg-background/80 p-0.5 backdrop-blur"
            >
              <ToggleGroupItem
                value="free"
                className="h-7 rounded-full px-3 text-sm text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
              >
                Free
              </ToggleGroupItem>
              <ToggleGroupItem
                value="tree"
                className="h-7 rounded-full px-3 text-sm text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
              >
                Tree
              </ToggleGroupItem>
            </ToggleGroup>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fit to screen"
                    onClick={() => setFitRequest((n) => n + 1)}
                    className="bg-background/80 backdrop-blur"
                  />
                }
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent>Fit to screen</TooltipContent>
            </Tooltip>
          </div>

          <p className="pointer-events-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {data.nodes.length}{" "}
              {data.nodes.length === 1 ? "thought" : "thoughts"}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>Esc</Kbd> back to writing
            </span>
          </p>
        </div>
      )}
    </section>
  )
}
