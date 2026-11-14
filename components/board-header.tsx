"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { ChartRelationshipIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type Mode = "brainstorm" | "critic"

type BoardHeaderProps = {
  mode: Mode
  onModeChange: (mode: Mode) => void
  aiEnabled: boolean
  onAiEnabledChange: (enabled: boolean) => void
  graphOpen: boolean
  onToggleGraph: () => void
}

export function BoardHeader({
  mode,
  onModeChange,
  aiEnabled,
  onAiEnabledChange,
  graphOpen,
  onToggleGraph,
}: BoardHeaderProps) {
  return (
    <header className="flex h-[78px] shrink-0 items-center justify-end bg-background px-8">
      <div className="flex items-center gap-5">
        <ToggleGroup
          value={[mode]}
          onValueChange={(value) => {
            const next = value[0] as Mode | undefined
            if (next) onModeChange(next)
          }}
          spacing={0}
          aria-label="Mode"
          className="rounded-full border border-border p-0.5"
        >
          <ToggleGroupItem
            value="brainstorm"
            className="h-8 rounded-full px-4 text-[15px] font-medium text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
          >
            Brainstorm
          </ToggleGroupItem>
          <ToggleGroupItem
            value="critic"
            className="h-8 rounded-full px-4 text-[15px] font-medium text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
          >
            Critic
          </ToggleGroupItem>
        </ToggleGroup>

        <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-foreground">
          AI
          <Switch
            checked={aiEnabled}
            onCheckedChange={onAiEnabledChange}
            aria-label="Toggle AI"
          />
        </label>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={graphOpen ? "Back to writing" : "View graph"}
                aria-pressed={graphOpen}
                onClick={onToggleGraph}
                className="size-10 text-foreground aria-pressed:bg-muted"
              />
            }
          >
            <HugeiconsIcon
              icon={ChartRelationshipIcon}
              className="size-6"
              strokeWidth={1.5}
            />
          </TooltipTrigger>
          <TooltipContent>
            {graphOpen ? "Back to writing" : "View graph"}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
