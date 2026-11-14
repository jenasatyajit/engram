"use client"

import { Mascot } from "@/components/mascot/mascot"
import type { MascotMood } from "@/components/mascot/poses"
import { useTypewriterCycle } from "@/hooks/use-typewriter-cycle"
import { cn } from "@/lib/utils"

type AgentPanelProps = {
  messages: readonly string[]
  mood?: MascotMood
}

const TEXT = "text-center text-[17px] leading-relaxed"

/**
 * Fixed-width box: mascot on top, its rotating message below.
 * Grows with the message up to 60% of the viewport.
 */
export function AgentPanel({ messages, mood = "idle" }: AgentPanelProps) {
  // The mascot doesn't talk in its sleep: hold the current line until it wakes.
  const { text, visible, phase } = useTypewriterCycle(messages, {
    paused: mood === "sleeping",
  })

  return (
    <section
      aria-label="Agent"
      className="flex max-h-[60svh] flex-col items-center gap-4 overflow-hidden rounded-3xl border border-border px-6 pt-6 pb-7"
    >
      <Mascot mood={mood} className="h-auto w-32 shrink-0" />

      <div className="grid min-h-0 w-full overflow-y-auto">
        {/* Invisible full message reserves the height, so the box doesn't jump while typing. */}
        <p
          aria-hidden
          className={cn(TEXT, "invisible col-start-1 row-start-1")}
        >
          {text}
          <span className="ml-0.5 inline-block w-[2px]" />
        </p>
        <p
          aria-hidden
          className={cn(TEXT, "col-start-1 row-start-1 text-foreground/90")}
        >
          {visible}
          <span
            className={cn(
              "ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] rounded-full bg-foreground/70",
              phase === "holding" && "animate-caret-blink"
            )}
          />
        </p>
      </div>

      {/* Screen readers get each message once, in full. */}
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
    </section>
  )
}
