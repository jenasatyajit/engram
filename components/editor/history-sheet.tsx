"use client"

import { useEffect, useState } from "react"

import { getNodeHistory } from "@/app/actions/boards"
import { Badge } from "@/components/ui/badge"
import { mentionsToPlain } from "@/lib/board/mentions"
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
                <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
                  {mentionsToPlain(v.text)}
                </p>
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
