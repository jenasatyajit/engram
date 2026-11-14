"use client"

import { useEffect, useRef, useState } from "react"

import { AgentPanel } from "@/components/agent-panel"
import { BoardHeader, type Mode } from "@/components/board-header"
import { useIdle } from "@/hooks/use-idle"
import { LIMITS } from "@/lib/board/inputs"
import type { BoardView } from "@/lib/board/repo"
import { EditorStoreProvider, useEditor } from "@/lib/editor/provider"

import { BranchChips } from "./branch-chips"
import { ChangeBar } from "./change-bar"
import { NodeBreadcrumb } from "./node-breadcrumb"
import { NodeMenu } from "./node-menu"

const AGENT_MESSAGES = [
  "ok bestie, spill. what's the thought we're spiraling on today? no wrong answers, only slightly cursed ones.",
  "brain dump first, make it pretty later. messy thoughts are still valid thoughts fr.",
  "got a half-baked idea? perfect. we branch it, poke it, and see if it survives the vibe check.",
  "every big plan started as a 3am 'wait what if...'. drop yours, we'll map it out step by step.",
] as const

/** Mascot falls asleep after this long without typing. */
const SLEEP_AFTER_MS = 30_000

/** The writing screen for one board. `initialView` is null for a brand-new board. */
export function BoardEditor({
  initialView,
}: {
  initialView: BoardView | null
}) {
  return (
    <EditorStoreProvider initialView={initialView}>
      <EditorScreen />
    </EditorStoreProvider>
  )
}

function EditorScreen() {
  const [mode, setMode] = useState<Mode>("brainstorm")
  const [aiEnabled, setAiEnabled] = useState(true)
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
        <div className="flex min-h-full gap-10 px-8 pt-12 pb-24 md:pl-[88px] lg:pr-10">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-8 max-w-3xl items-center justify-between gap-4">
              <NodeBreadcrumb />
              <NodeMenu />
            </div>

            <TitleField onType={ping} />
            <BodyField onType={ping} />
            <ChangeBar />
            <BranchChips />
          </div>

          <aside className="sticky top-12 hidden w-[320px] shrink-0 self-start lg:block">
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

function TitleField({ onType }: { onType: () => void }) {
  const title = useEditor((s) => s.title)
  const setTitle = useEditor((s) => s.setTitle)
  const commitTitle = useEditor((s) => s.commitTitle)
  const isNewBoard = useEditor((s) => s.boardId === null)

  return (
    <textarea
      value={title}
      onChange={(e) => {
        setTitle(e.target.value)
        onType()
      }}
      onBlur={() => commitTitle()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          document.getElementById("thought-body")?.focus()
        }
      }}
      rows={1}
      maxLength={LIMITS.title}
      placeholder="I am thinking about..."
      aria-label="Title"
      autoFocus={isNewBoard}
      className="mt-6 block [field-sizing:content] w-full resize-none overflow-hidden bg-transparent text-[52px] leading-[1.15] font-semibold tracking-tight text-foreground caret-foreground outline-none placeholder:text-muted-foreground/70"
    />
  )
}

function BodyField({ onType }: { onType: () => void }) {
  const draft = useEditor((s) => s.draft)
  const target = useEditor((s) => s.target)
  const setDraft = useEditor((s) => s.setDraft)
  const restoreLocalDraft = useEditor((s) => s.restoreLocalDraft)
  const revise = useEditor((s) => s.revise)
  const branchInstead = useEditor((s) => s.branchInstead)
  const newBranch = useEditor((s) => s.newBranch)
  const isNewBoard = useEditor((s) => s.boardId === null)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Local drafts can only be read in the browser, so load them after mount.
  useEffect(() => {
    restoreLocalDraft()
  }, [restoreLocalDraft])

  // Moving to another node: focus the body with the cursor at the end.
  const targetKey =
    target.kind === "node" ? target.nodeId : `new:${target.parentId}`
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      if (isNewBoard) return
    }
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [targetKey, isNewBoard])

  return (
    <textarea
      id="thought-body"
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        onType()
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return
        const mod = e.ctrlKey || e.metaKey
        if (mod && e.shiftKey) {
          e.preventDefault()
          branchInstead()
        } else if (mod) {
          e.preventDefault()
          revise()
        } else if (e.altKey) {
          e.preventDefault()
          newBranch()
        }
      }}
      maxLength={LIMITS.nodeText}
      placeholder={
        target.kind === "new" && target.parentId
          ? "a new branch..."
          : "flow your words"
      }
      aria-label="Thought"
      className="mt-[52px] block [field-sizing:content] min-h-[6.8em] w-full max-w-3xl resize-none overflow-hidden bg-transparent font-serif text-[22px] leading-[1.7] text-foreground caret-foreground outline-none placeholder:text-muted-foreground/80"
    />
  )
}
