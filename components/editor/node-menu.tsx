"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Clock01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NODE_TYPES, type NodeType } from "@/lib/db/schema"
import { useEditor } from "@/lib/editor/provider"
import { nodeById } from "@/lib/editor/store"

import { HistorySheet } from "./history-sheet"

const NONE = "none"

/** "⋯" menu for the current node: type label, version history, delete. */
export function NodeMenu() {
  const node = useEditor((s) =>
    s.target.kind === "node" ? nodeById(s.view, s.target.nodeId) : undefined
  )
  const busy = useEditor((s) => s.busy)
  const setType = useEditor((s) => s.setType)
  const deleteCurrent = useEditor((s) => s.deleteCurrent)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!node) return null

  return (
    <div className="flex items-center gap-2">
      {node.type && (
        <Badge variant="secondary" className="capitalize">
          {node.type}
        </Badge>
      )}
      {node.versionCount > 1 && (
        <span
          className="text-sm text-muted-foreground"
          title="Number of versions"
        >
          v{node.versionCount}
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Thought options"
              disabled={busy}
              className="text-muted-foreground"
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
              Type
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={node.type ?? NONE}
                onValueChange={(value) =>
                  setType(value === NONE ? null : (value as NodeType))
                }
              >
                <DropdownMenuRadioItem value={NONE}>None</DropdownMenuRadioItem>
                {NODE_TYPES.map((type) => (
                  <DropdownMenuRadioItem
                    key={type}
                    value={type}
                    className="capitalize"
                  >
                    {type}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
            <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
            Version history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => deleteCurrent()}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <HistorySheet
        nodeId={node.id}
        versionCount={node.versionCount}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  )
}
