"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { LIMITS } from "@/lib/board/inputs"
import { useEditor } from "@/lib/editor/provider"
import { isDirty } from "@/lib/editor/store"

/** Appears once the text differs from the saved version: Revise, Branch instead, or Discard. */
export function ChangeBar() {
  const dirty = useEditor(isDirty)
  const isNew = useEditor((s) => s.target.kind === "new")
  const busy = useEditor((s) => s.busy)
  const note = useEditor((s) => s.note)
  const setNote = useEditor((s) => s.setNote)
  const revise = useEditor((s) => s.revise)
  const branchInstead = useEditor((s) => s.branchInstead)
  const discard = useEditor((s) => s.discard)

  if (!dirty) return null

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="mt-8 flex max-w-3xl flex-col gap-3 border-t border-border pt-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm text-muted-foreground">
          {isNew ? "New thought" : "Edited"}
        </span>

        <Button size="sm" onClick={() => revise()} disabled={busy}>
          {isNew ? "Save" : "Revise"}
          <KbdGroup className="ml-1 opacity-70">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>
        </Button>

        {!isNew && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => branchInstead()}
            disabled={busy}
          >
            Branch instead
            <KbdGroup className="ml-1 opacity-70">
              <Kbd>Ctrl</Kbd>
              <Kbd>Shift</Kbd>
              <Kbd>Enter</Kbd>
            </KbdGroup>
          </Button>
        )}

        <Button size="sm" variant="ghost" onClick={discard} disabled={busy}>
          Discard
        </Button>
      </div>

      {!isNew && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={LIMITS.note}
          placeholder="why did this change? (optional)"
          aria-label="Why did this change?"
          className="h-8 max-w-md text-sm"
        />
      )}
    </div>
  )
}
