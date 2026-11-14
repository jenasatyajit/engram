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
import { useEditor } from "@/lib/editor/provider"
import { anchorNodeId, nodeById } from "@/lib/editor/store"

import { snippet } from "./snippet"

/** Path from the root to the current node. Click any step to go back up. */
export function NodeBreadcrumb() {
  const view = useEditor((s) => s.view)
  const target = useEditor((s) => s.target)
  const goTo = useEditor((s) => s.goTo)
  const busy = useEditor((s) => s.busy)

  // Walk up from the current node (or the parent of a new branch) to the root.
  const path: { id: string; label: string }[] = []
  let cursor = anchorNodeId(target)
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const node = nodeById(view, cursor)
    if (!node) break
    path.unshift({ id: node.id, label: snippet(node.text, 28) })
    cursor = node.parentId
  }

  if (path.length === 0 && target.kind === "new") return null

  // Long paths: keep the root and the last two steps.
  const collapsed = path.length > 4
  const shown = collapsed ? [path[0], ...path.slice(-2)] : path
  const currentId = target.kind === "node" ? target.nodeId : null

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-[15px]">
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
            <BreadcrumbItem>
              {step.id === currentId ? (
                <BreadcrumbPage className="max-w-[16rem] truncate">
                  {step.label}
                </BreadcrumbPage>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => goTo({ kind: "node", nodeId: step.id })}
                  className="max-w-[16rem] truncate transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {step.label}
                </button>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
        {target.kind === "new" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="italic">New branch</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
