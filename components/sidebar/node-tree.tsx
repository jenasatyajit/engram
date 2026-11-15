"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { AiMark } from "@/components/editor/ai-mark"
import { nodeLabel } from "@/lib/board/labels"
import { plainText } from "@/lib/board/formatting"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import type { NodeView } from "@/lib/board/repo"
import { cn } from "@/lib/utils"

type TreeProps = {
  nodes: NodeView[]
  activeNodeId: string | null
  onOpen: (nodeId: string) => void
}

/** A board's thoughts as a tree that follows the branches. */
export function NodeTree({ nodes, activeNodeId, onOpen }: TreeProps) {
  const children = new Map<string | null, NodeView[]>()
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    // A node whose parent isn't live is shown as a root.
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(n)
  }
  for (const list of children.values())
    list.sort((a, b) => +a.createdAt - +b.createdAt)

  // Start with the active node's ancestors expanded.
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]))
  const openPath = new Set<string>()
  let cursor = activeNodeId ? (parentOf.get(activeNodeId) ?? null) : null
  while (cursor && !openPath.has(cursor)) {
    openPath.add(cursor)
    cursor = parentOf.get(cursor) ?? null
  }

  const roots = children.get(null) ?? []
  if (roots.length === 0) {
    return (
      <p className="px-3 py-1.5 text-xs text-sidebar-foreground/50">
        No thoughts yet
      </p>
    )
  }

  return (
    <SidebarMenuSub className="mr-0 pr-0">
      {roots.map((n) => (
        <TreeItem
          key={n.id}
          node={n}
          childrenOf={children}
          activeNodeId={activeNodeId}
          openPath={openPath}
          onOpen={onOpen}
        />
      ))}
    </SidebarMenuSub>
  )
}

function TreeItem({
  node,
  childrenOf,
  activeNodeId,
  openPath,
  onOpen,
}: {
  node: NodeView
  childrenOf: Map<string | null, NodeView[]>
  activeNodeId: string | null
  openPath: Set<string>
  onOpen: (nodeId: string) => void
}) {
  const kids = childrenOf.get(node.id) ?? []
  const [open, setOpen] = useState(() => openPath.has(node.id))
  const isActive = node.id === activeNodeId

  const button = (
    <SidebarMenuSubButton
      render={<button type="button" />}
      isActive={isActive}
      onClick={() => onOpen(node.id)}
      title={plainText(node.text)}
      className={cn("w-full cursor-pointer", kids.length > 0 && "pr-7")}
    >
      <span className="truncate">{nodeLabel(node, 40)}</span>
      {node.titleSource === "ai" && <AiMark />}
    </SidebarMenuSubButton>
  )

  if (kids.length === 0)
    return <SidebarMenuSubItem>{button}</SidebarMenuSubItem>

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuSubItem>
        {button}
        <CollapsibleTrigger
          aria-label={open ? "Hide branches" : "Show branches"}
          className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground [&[data-panel-open]>svg]:rotate-90"
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-3.5 transition-transform duration-200"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {kids.map((k) => (
              <TreeItem
                key={k.id}
                node={k}
                childrenOf={childrenOf}
                activeNodeId={activeNodeId}
                openPath={openPath}
                onOpen={onOpen}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuSubItem>
    </Collapsible>
  )
}
