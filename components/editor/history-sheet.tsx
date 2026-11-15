"use client"

import { useEffect, useMemo, useState } from "react"

import { getNodeHistory } from "@/app/actions/boards"
import { Badge } from "@/components/ui/badge"
import {
  collapseContext,
  diffLines,
  type DiffGap,
  type DiffLine,
} from "@/lib/board/diff"
import { plainText } from "@/lib/board/formatting"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import type { NodeVersion } from "@/lib/db/schema"

const formatTime = (d: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d)

/** Every version of a node, newest first. Read-only. */
export function HistorySheet({
  nodeId,
  versionCount,
  open,
  onOpenChange,
}: {
  nodeId: string
  versionCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [versions, setVersions] = useState<NodeVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showFull, setShowFull] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getNodeHistory({ nodeId }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setVersions([...result.data].reverse())
        setError(null)
      } else {
        setError(result.error.message)
      }
    })
    return () => {
      cancelled = true
    }
    // Refetch when a new version lands while the sheet is open.
  }, [open, nodeId, versionCount])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>
            Every saved version of this thought, newest first.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!versions && !error && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          <ol className="flex flex-col gap-3">
            {versions?.map((v, i) => (
              <li key={v.id} className="rounded-2xl border border-border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>v{versions.length - i}</span>
                  <span>·</span>
                  <time dateTime={v.createdAt.toISOString()}>
                    {formatTime(v.createdAt)}
                  </time>
                  {i === 0 && <Badge variant="secondary">current</Badge>}
                  {v.autoSaved && <Badge variant="outline">auto-saved</Badge>}
                  {v.author === "ai" && <Badge variant="outline">AI</Badge>}
                </div>
                <VersionChanges
                  before={versions[i + 1]?.text ?? null}
                  after={v.text}
                  full={showFull.has(v.id)}
                  onToggleFull={() =>
                    setShowFull((prev) => {
                      const next = new Set(prev)
                      if (!next.delete(v.id)) next.add(v.id)
                      return next
                    })
                  }
                />
                {v.note && (
                  <p className="mt-2 text-sm text-muted-foreground italic">
                    Why: {v.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

/** What changed from the previous version, like a code diff: red removed, green added. */
function VersionChanges({
  before,
  after,
  full,
  onToggleFull,
}: {
  before: string | null
  after: string
  full: boolean
  onToggleFull: () => void
}) {
  const lines = useMemo(
    () =>
      diffLines(before === null ? null : plainText(before), plainText(after)),
    [before, after]
  )
  const changed = lines.some((l) => l.kind !== "same")
  const rows = useMemo(
    () => (full ? lines : collapseContext(lines, 1)),
    [lines, full]
  )

  if (!changed) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {before !== null && before !== after
          ? "Only formatting changed."
          : "No text changes."}
      </p>
    )
  }

  return (
    <div>
      <div
        role="list"
        aria-label="Changes in this version"
        className="overflow-hidden rounded-xl border border-border/60 font-serif text-[15px] leading-relaxed"
      >
        {rows.map((row, k) =>
          row.kind === "gap" ? (
            <Gap key={k} gap={row} />
          ) : (
            <Line key={k} line={row} />
          )
        )}
      </div>
      {lines.some((l) => l.kind === "same") && (
        <button
          type="button"
          onClick={onToggleFull}
          className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          {full ? "Show only changes" : "Show full text"}
        </button>
      )}
    </div>
  )
}

function Gap({ gap }: { gap: DiffGap }) {
  return (
    <div className="bg-muted/40 px-3 py-0.5 text-center font-sans text-xs text-muted-foreground">
      {gap.count} unchanged {gap.count === 1 ? "line" : "lines"}
    </div>
  )
}

function Line({ line }: { line: DiffLine }) {
  const add = line.kind === "add"
  const del = line.kind === "del"
  return (
    <div
      role="listitem"
      className={cn(
        "flex gap-2 px-2 py-0.5",
        add && "bg-stance-for/15",
        del && "bg-stance-against/15",
        line.kind === "same" && "text-muted-foreground"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "w-3 shrink-0 text-center font-mono text-xs leading-[1.9] select-none",
          add && "text-stance-for",
          del && "text-stance-against"
        )}
      >
        {add ? "+" : del ? "-" : ""}
      </span>
      <span className="min-w-0 break-words whitespace-pre-wrap">
        <span className="sr-only">
          {add ? "Added: " : del ? "Removed: " : ""}
        </span>
        {line.segments
          ? line.segments.map((s, i) => (
              <span
                key={i}
                className={cn(
                  s.changed && "rounded-sm font-medium",
                  s.changed && add && "bg-stance-for/35",
                  s.changed && del && "bg-stance-against/35"
                )}
              >
                {s.text}
              </span>
            ))
          : line.text || "\u00a0"}
      </span>
    </div>
  )
}
