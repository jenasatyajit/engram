"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  JusticeScale01Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@hugeicons/core-free-icons"

import { StanceDot } from "@/components/critic/stance"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { nodeLabel } from "@/lib/board/labels"
import { argumentTypeFor } from "@/lib/critic/stance"
import { useEditor } from "@/lib/editor/provider"
import { nodeById } from "@/lib/editor/store"

import { AiMark } from "./ai-mark"

/** The current node's branches, plus "+ New branch" (Brainstorm) or "+ For / + Against" (Critic). */
export function BranchChips() {
  const view = useEditor((s) => s.view)
  const target = useEditor((s) => s.target)
  const busy = useEditor((s) => s.busy)
  const mode = useEditor((s) => s.mode)
  const goTo = useEditor((s) => s.goTo)
  const newBranch = useEditor((s) => s.newBranch)
  const newArgument = useEditor((s) => s.newArgument)

  // Nothing to branch from until the first thought exists.
  if (target.kind === "new") return null

  const current = nodeById(view, target.nodeId)
  const children = (view?.nodes ?? [])
    .filter((n) => n.parentId === target.nodeId)
    .sort((a, b) => +a.createdAt - +b.createdAt)
  const againstType = argumentTypeFor("against", current?.type ?? null)

  return (
    <nav
      aria-label="Branches"
      className="mt-10 flex max-w-3xl flex-wrap items-center gap-2"
    >
      {children.length > 0 && (
        <span className="mr-1 text-sm text-muted-foreground">
          {mode === "critic" ? "Arguments" : "Branches"}
        </span>
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
          <StanceDot type={child.type} />
          <span className="truncate">{nodeLabel(child, 32)}</span>
          {child.createdBy === "ai" ? (
            <AiMark label="Written by AI" />
          ) : (
            child.titleSource === "ai" && <AiMark />
          )}
        </Button>
      ))}

      {mode === "critic" ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => newArgument("for")}
            className="rounded-full text-muted-foreground"
          >
            <HugeiconsIcon
              icon={ThumbsUpIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            For
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => newArgument("against")}
            className="rounded-full text-muted-foreground"
          >
            <HugeiconsIcon
              icon={ThumbsDownIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {againstType === "defense" ? "Rebut" : "Against"}
          </Button>
          {current && !current.parentId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => newArgument("verdict")}
              className="rounded-full text-muted-foreground"
            >
              <HugeiconsIcon
                icon={JusticeScale01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Verdict
            </Button>
          )}
        </>
      ) : (
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
      )}
    </nav>
  )
}
