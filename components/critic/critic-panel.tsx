"use client"

import { useMemo } from "react"
import { AnimatePresence } from "motion/react"

import { AgentPanel } from "@/components/agent-panel"
import { Button } from "@/components/ui/button"
import { useEditor } from "@/lib/editor/provider"

import { FindingCard } from "./finding-card"

/*
 * The mascot panel in Critic mode (SPEC.md 6.2, 8): what the AI noticed after
 * the last leave event, with an action on each finding. Errors never block writing.
 */

const LINES = {
  aiOff: [
    "ai's off, so i'm just watching. flip it on and i'll start poking holes in your case.",
  ],
  noBoard: [
    "drop your main thought up top, then stack For and Against under it. i'll keep score.",
  ],
  waiting: [
    "build your case with For and Against. every time you move on, i'll take a look.",
    "steelman both sides. i'll call out duplicates, clashes and anything missing.",
  ],
  reviewing: [
    "reading your whole case, every branch...",
    "checking the receipts, one sec...",
  ],
  found: ["ok, here's what i noticed:"],
  clean: ["no notes rn. your case holds up, keep building."],
} as const

export function CriticPanel({ sleeping }: { sleeping: boolean }) {
  const aiEnabled = useEditor((s) => s.aiEnabled)
  const boardId = useEditor((s) => s.boardId)
  const view = useEditor((s) => s.view)
  const critic = useEditor((s) => s.critic)
  const goTo = useEditor((s) => s.goTo)
  const acceptFinding = useEditor((s) => s.acceptFinding)
  const dismissFinding = useEditor((s) => s.dismissFinding)
  const reviewNow = useEditor((s) => s.reviewNow)
  const busy = useEditor((s) => s.busy)

  const nodes = useMemo(
    () => new Map((view?.nodes ?? []).map((n) => [n.id, n])),
    [view]
  )

  // Only findings whose thoughts are all still on the board.
  const findings = critic.findings.filter(
    (f) =>
      f.nodeIds.every((id) => nodes.has(id)) &&
      (!f.argument || nodes.has(f.argument.parentNodeId))
  )

  const reviewing = critic.status === "reviewing"
  const messages: readonly string[] = !aiEnabled
    ? LINES.aiOff
    : !boardId
      ? LINES.noBoard
      : reviewing
        ? LINES.reviewing
        : critic.status === "error" && critic.error
          ? [critic.error]
          : findings.length > 0
            ? LINES.found
            : critic.reviewed
              ? LINES.clean
              : LINES.waiting

  const mood = reviewing ? "thinking" : sleeping ? "sleeping" : "idle"
  const showFindings = aiEnabled && boardId && findings.length > 0

  return (
    <AgentPanel
      messages={messages}
      mood={mood}
      className="max-h-[calc(100svh-9rem)]"
    >
      {aiEnabled && boardId && critic.status === "error" && (
        <Button
          size="sm"
          variant="outline"
          onClick={reviewNow}
          className="h-7 shrink-0 text-xs"
        >
          Try again
        </Button>
      )}

      {showFindings && (
        <ul
          aria-label="AI findings"
          className="-mx-2 flex min-h-0 w-[calc(100%+1rem)] flex-col gap-2.5 overflow-y-auto px-2 pb-1"
        >
          <AnimatePresence initial={false}>
            {findings.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                nodes={nodes}
                busy={busy || critic.actingOn !== null}
                onOpenNode={(nodeId) => void goTo({ kind: "node", nodeId })}
                onAccept={() => void acceptFinding(f.id)}
                onDismiss={() => void dismissFinding(f.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {aiEnabled && boardId && !reviewing && critic.status !== "error" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={reviewNow}
          className="h-7 shrink-0 text-xs text-muted-foreground"
        >
          Review now
        </Button>
      )}
    </AgentPanel>
  )
}
