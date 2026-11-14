"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertDiamondIcon,
  BulbIcon,
  Copy01Icon,
  Link04Icon,
  Note01Icon,
  Unlink04Icon,
} from "@hugeicons/core-free-icons"

import { AiMark } from "@/components/editor/ai-mark"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { nodeLabel } from "@/lib/board/labels"
import type { NodeView } from "@/lib/board/repo"
import { NO_SOURCE_LABEL } from "@/lib/critic/format"
import type { FindingView } from "@/lib/critic/repo"
import { argumentTypeFor } from "@/lib/critic/stance"
import type { FindingKind } from "@/lib/db/schema"
import { displayHost, safeHttpUrl } from "@/lib/safe-url"
import { cn } from "@/lib/utils"

import { argumentRoleLabel, stanceColor } from "./stance"

const KIND: Record<FindingKind, { label: string; icon: typeof BulbIcon }> = {
  duplicate: { label: "Duplicate", icon: Copy01Icon },
  contradiction: { label: "Contradiction", icon: Unlink04Icon },
  new_argument: { label: "New argument", icon: Note01Icon },
  weak_support: { label: "Weak support", icon: AlertDiamondIcon },
  hint: { label: "Hint", icon: BulbIcon },
}

/** What accepting does, in the owner's words. */
function acceptLabel(finding: FindingView, nodes: Map<string, NodeView>) {
  if (finding.kind === "new_argument" && finding.argument) {
    const parent = nodes.get(finding.argument.parentNodeId)
    const type = argumentTypeFor(finding.argument.stance, parent?.type ?? null)
    return type === "evidence"
      ? "Add as For"
      : type === "defense"
        ? "Add as rebuttal"
        : "Add as Against"
  }
  if (finding.kind === "duplicate") return "Link as related"
  if (finding.kind === "contradiction") return "Link as contradicts"
  return "Got it"
}

/** One AI finding: what the mascot noticed, which thoughts it is about, and what you can do. */
export function FindingCard({
  finding,
  nodes,
  busy,
  onOpenNode,
  onAccept,
  onDismiss,
}: {
  finding: FindingView
  nodes: Map<string, NodeView>
  busy: boolean
  onOpenNode: (nodeId: string) => void
  onAccept: () => void
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const kind = KIND[finding.kind]
  const arg = finding.argument
  const parent = arg ? nodes.get(arg.parentNodeId) : undefined
  const argType = arg ? argumentTypeFor(arg.stance, parent?.type ?? null) : null
  const referenced = (arg ? [] : finding.nodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeView => Boolean(n))

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="rounded-2xl border border-border bg-muted/20 p-3.5 text-left"
      data-finding-kind={finding.kind}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <HugeiconsIcon icon={kind.icon} strokeWidth={2} className="size-3.5" />
        <span className="font-medium">{kind.label}</span>
        <AiMark label="Written by AI" className="ml-auto" />
      </div>

      <p className="text-sm leading-relaxed text-foreground/90">
        {finding.message}
      </p>

      {arg && argType && (
        <div className="mt-2.5 rounded-xl border border-border/70 bg-background/40 p-2.5">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-background",
                stanceColor(argType)
              )}
            >
              {argumentRoleLabel(argType)}
            </span>
            {parent && (
              <button
                type="button"
                onClick={() => onOpenNode(parent.id)}
                className="max-w-[11rem] truncate text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                title={parent.text}
              >
                on {nodeLabel(parent, 28)}
              </button>
            )}
          </div>
          <p className="text-sm font-semibold">{arg.title}</p>
          <p
            className={cn(
              "mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground",
              !expanded && "line-clamp-4"
            )}
          >
            {arg.text}
          </p>
          {arg.text.length > 220 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "less" : "more"}
            </button>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {arg.sources.length === 0 ? (
              <Badge variant="outline" className="text-[11px] font-normal">
                {NO_SOURCE_LABEL}
              </Badge>
            ) : (
              arg.sources.map((s) => {
                const href = safeHttpUrl(s.url)
                if (!href) return null
                return (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.title}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={Link04Icon}
                      strokeWidth={2}
                      className="size-3"
                    />
                    <span className="truncate">{displayHost(href)}</span>
                  </a>
                )
              })
            )}
          </div>
        </div>
      )}

      {referenced.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {referenced.map((n) => (
            <Button
              key={n.id}
              size="xs"
              variant="outline"
              onClick={() => onOpenNode(n.id)}
              className="max-w-[12rem] rounded-full"
              title={n.text}
            >
              <span className="truncate">{nodeLabel(n, 24)}</span>
            </Button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <Button
          size="sm"
          onClick={onAccept}
          disabled={busy}
          className="h-7 px-3 text-xs"
        >
          {acceptLabel(finding, nodes)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          disabled={busy}
          className="h-7 px-3 text-xs text-muted-foreground"
        >
          Dismiss
        </Button>
      </div>
    </motion.li>
  )
}
