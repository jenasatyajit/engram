"use client"

import { useRef, useState } from "react"

import { AgentPanel } from "@/components/agent-panel"
import { BoardHeader, type Mode } from "@/components/board-header"
import { useIdle } from "@/hooks/use-idle"

const AGENT_MESSAGES = [
  "ok bestie, spill. what's the thought we're spiraling on today? no wrong answers, only slightly cursed ones.",
  "brain dump first, make it pretty later. messy thoughts are still valid thoughts fr.",
  "got a half-baked idea? perfect. we branch it, poke it, and see if it survives the vibe check.",
  "every big plan started as a 3am 'wait what if...'. drop yours, we'll map it out step by step.",
] as const

/** Mascot falls asleep after this long without typing. */
const SLEEP_AFTER_MS = 30_000

export default function Page() {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [mode, setMode] = useState<Mode>("brainstorm")
  const [aiEnabled, setAiEnabled] = useState(true)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { isIdle, ping } = useIdle(SLEEP_AFTER_MS)

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <BoardHeader
        mode={mode}
        onModeChange={setMode}
        aiEnabled={aiEnabled}
        onAiEnabledChange={setAiEnabled}
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full gap-10 px-8 pt-[88px] pb-24 md:pl-[88px] lg:pr-10">
          <div className="flex min-w-0 flex-1 flex-col">
            <textarea
              value={title}
              onChange={(e) => {
                setTitle(e.target.value.replace(/\n/g, ""))
                ping()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  bodyRef.current?.focus()
                }
              }}
              rows={1}
              placeholder="I am thinking about..."
              aria-label="Title"
              autoFocus
              className="block [field-sizing:content] w-full resize-none overflow-hidden bg-transparent text-[52px] leading-[1.15] font-semibold tracking-tight text-foreground caret-foreground outline-none placeholder:text-muted-foreground/70"
            />

            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                ping()
              }}
              placeholder="flow your words"
              aria-label="Thought"
              className="mt-[52px] block [field-sizing:content] min-h-[1.7em] w-full max-w-3xl flex-1 resize-none overflow-hidden bg-transparent font-serif text-[22px] leading-[1.7] text-foreground caret-foreground outline-none placeholder:text-muted-foreground/80"
            />
          </div>

          <aside className="sticky top-[88px] hidden w-[320px] shrink-0 self-start lg:block">
            <AgentPanel
              messages={AGENT_MESSAGES}
              mood={isIdle ? "sleeping" : "idle"}
            />
          </aside>
        </div>
      </main>
    </div>
  )
}
