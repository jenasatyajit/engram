"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useEditor } from "@/lib/editor/provider"

import { snippet } from "./snippet"

/** The current node's branches, plus "+ New branch". */
export function BranchChips() {
  const view = useEditor((s) => s.view)
  const target = useEditor((s) => s.target)
  const busy = useEditor((s) => s.busy)
  const goTo = useEditor((s) => s.goTo)
  const newBranch = useEditor((s) => s.newBranch)

  // Nothing to branch from until the first thought exists.
  if (target.kind === "new") return null

  const children = (view?.nodes ?? [])
    .filter((n) => n.parentId === target.nodeId)
    .sort((a, b) => +a.createdAt - +b.createdAt)

  return (
    <nav
      aria-label="Branches"
      className="mt-10 flex max-w-3xl flex-wrap items-center gap-2"
    >
      {children.length > 0 && (
        <span className="mr-1 text-sm text-muted-foreground">Branches</span>
      )}
      {children.map((child) => (
        <Button
          key={child.id}
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => goTo({ kind: "node", nodeId: child.id })}
          className="max-w-[16rem] rounded-full"
          title={child.text}
        >
          <span className="truncate">{snippet(child.text, 32)}</span>
        </Button>
      ))}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => newBranch()}
        className="rounded-full text-muted-foreground"
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        New branch
        <KbdGroup className="ml-1 opacity-70">
          <Kbd>Alt</Kbd>
          <Kbd>Enter</Kbd>
        </KbdGroup>
      </Button>
    </nav>
  )
}
