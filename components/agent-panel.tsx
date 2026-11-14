"use client"

import type { ReactNode } from "react"

import { Mascot } from "@/components/mascot/mascot"
import type { MascotMood } from "@/components/mascot/poses"
import { useTypewriterCycle } from "@/hooks/use-typewriter-cycle"
import { cn } from "@/lib/utils"

type AgentPanelProps = {
  messages: readonly string[]
  mood?: MascotMood
  /** Extra content under the message (Critic findings). */
  children?: ReactNode
  className?: string
}

const TEXT = "text-center text-[17px] leading-relaxed"

/**
 * Fixed-width box: mascot on top, its rotating message below, then any extra content.
 * Grows with its content up to a share of the viewport, then scrolls.
 */
export function AgentPanel({
  messages,
  mood = "idle",
  children,
  className,
}: AgentPanelProps) {
  return (
    <section
      aria-label="Agent"
      className={cn(
        "flex max-h-[60svh] flex-col items-center gap-4 overflow-hidden rounded-3xl border border-border px-6 pt-6 pb-7",
        className
      )}
    >
      <Mascot mood={mood} className="h-auto w-32 shrink-0" />
      {/* A new set of messages starts typing from the beginning. */}
      <Typewriter
        key={messages.join("\u0000")}
        messages={messages}
        mood={mood}
      />
      {children}
    </section>
  )
}

function Typewriter({
  messages,
  mood,
}: {
  messages: readonly string[]
  mood: MascotMood
}) {
  // The mascot doesn't talk in its sleep: hold the current line until it wakes.
  const { text, visible, phase } = useTypewriterCycle(messages, {
    paused: mood === "sleeping",
  })

  return (
    <>
      <div className="grid min-h-0 w-full shrink-0 overflow-y-auto">
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
    </>
  )
}
