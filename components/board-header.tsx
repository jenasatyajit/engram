"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChartRelationshipIcon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useSidebar } from "@/components/ui/sidebar"
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
  /** Shown next to the sidebar toggle (the node breadcrumb). */
  leading?: React.ReactNode
}

export function BoardHeader({
  mode,
  onModeChange,
  aiEnabled,
  onAiEnabledChange,
  graphOpen,
  onToggleGraph,
  leading,
}: BoardHeaderProps) {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar()
  const sidebarOpen = isMobile ? openMobile : open

  return (
    <header className="flex h-[78px] shrink-0 items-center justify-between gap-6 bg-background px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                aria-expanded={sidebarOpen}
                onClick={toggleSidebar}
                className="size-10 text-foreground"
              />
            }
          >
            <HugeiconsIcon
              icon={SidebarLeftIcon}
              className="size-6"
              strokeWidth={1.5}
            />
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            {sidebarOpen ? "Close sidebar" : "Open sidebar"}
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <Kbd>B</Kbd>
            </KbdGroup>
          </TooltipContent>
        </Tooltip>
        {leading}
      </div>

      <div className="flex shrink-0 items-center gap-5">
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
