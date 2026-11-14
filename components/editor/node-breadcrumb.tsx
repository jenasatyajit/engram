"use client"

import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { nodeLabel } from "@/lib/board/labels"
import { useEditor } from "@/lib/editor/provider"
import { anchorNodeId, newBranchTitle, nodeById } from "@/lib/editor/store"

import { AiMark } from "./ai-mark"

/** Path from the root to the current node, shown in the header. Click any step to go back up. */
export function NodeBreadcrumb() {
  const view = useEditor((s) => s.view)
  const target = useEditor((s) => s.target)
  const goTo = useEditor((s) => s.goTo)
  const busy = useEditor((s) => s.busy)

  // Walk up from the current node (or the parent of a new branch) to the root.
  const path: { id: string; label: string; full: string; ai: boolean }[] = []
  let cursor = anchorNodeId(target)
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const node = nodeById(view, cursor)
    if (!node) break
    path.unshift({
      id: node.id,
      label: nodeLabel(node, 28),
      full: nodeLabel(node, 200),
      ai: node.titleSource === "ai",
    })
    cursor = node.parentId
  }

  if (path.length === 0 && target.kind === "new") return null

  // Long paths: keep the root and the last two steps.
  const collapsed = path.length > 4
  const shown = collapsed ? [path[0], ...path.slice(-2)] : path
  const currentId = target.kind === "node" ? target.nodeId : null

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-[15px]">
        {shown.map((step, i) => (
          <Fragment key={step.id}>
            {i > 0 && <BreadcrumbSeparator />}
            {collapsed && i === 1 && (
              <>
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem className="min-w-0">
              {step.id === currentId ? (
                <BreadcrumbPage
                  className="flex min-w-0 items-center gap-1"
                  title={step.full}
                >
                  <span className="max-w-[14rem] truncate">{step.label}</span>
                  {step.ai && <AiMark />}
                </BreadcrumbPage>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  title={step.full}
                  onClick={() => goTo({ kind: "node", nodeId: step.id })}
                  className="flex min-w-0 items-center gap-1 transition-colors hover:text-foreground disabled:opacity-60"
                >
                  <span className="max-w-[12rem] truncate">{step.label}</span>
                  {step.ai && <AiMark />}
                </button>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
        {target.kind === "new" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage
                className="max-w-[14rem] truncate whitespace-nowrap italic"
                title={newBranchTitle(view, target) ?? "New branch"}
              >
                {newBranchTitle(view, target) ?? "New branch"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
