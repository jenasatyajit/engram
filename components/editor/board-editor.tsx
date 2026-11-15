"use client"

import dynamic from "next/dynamic"
import { useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"

import { AgentPanel } from "@/components/agent-panel"
import { BoardHeader } from "@/components/board-header"
import { CriticPanel } from "@/components/critic/critic-panel"
import { GraphScreen } from "@/components/graph/graph-screen"
import { AppSidebar } from "@/components/sidebar/app-sidebar"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { useIdle } from "@/hooks/use-idle"
import { LIMITS } from "@/lib/board/inputs"
import type { BoardView } from "@/lib/board/repo"
import { EditorStoreProvider, useEditor } from "@/lib/editor/provider"
import { stripNewBoardParam } from "@/lib/editor/new-board"

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

/**
 * The writing screen for one board. `initialView` is null for a brand-new board.
 * `sidebarOpen` comes from the sidebar cookie (read on the server, so there is no flicker).
 */
export function BoardEditor({
  initialView,
  initialNodeId,
  sidebarOpen,
}: {
  initialView: BoardView | null
  initialNodeId?: string | null
  sidebarOpen: boolean
}) {
  return (
    <EditorStoreProvider
      initialView={initialView}
      initialNodeId={initialNodeId}
    >
      <SidebarProvider
        defaultOpen={sidebarOpen}
        data-app-shell=""
        className="h-dvh min-h-0 overflow-clip"
      >
        <AppSidebar />
        <EditorScreen />
      </SidebarProvider>
    </EditorStoreProvider>
  )
}

function EditorScreen() {
  const mode = useEditor((s) => s.mode)
  const setMode = useEditor((s) => s.setMode)
  const aiEnabled = useEditor((s) => s.aiEnabled)
  const setAiEnabled = useEditor((s) => s.setAiEnabled)
  const restorePreferences = useEditor((s) => s.restorePreferences)
  const findingsWaiting = useEditor(
    (s) => s.mode === "critic" && s.aiEnabled && s.critic.findings.length > 0
  )
  const { isIdle, ping } = useIdle(SLEEP_AFTER_MS)

  // The saved AI toggle and mode live in localStorage, which only exists in the browser.
  useEffect(() => {
    restorePreferences()
  }, [restorePreferences])

  // A "New board" link carries a one-off token (lib/editor/new-board.ts); keep the address bar clean.
  useEffect(() => {
    stripNewBoardParam()
  }, [])
  const screen = useEditor((s) => s.screen)
  const showGraph = useEditor((s) => s.showGraph)
  const showEditor = useEditor((s) => s.showEditor)
  const busy = useEditor((s) => s.busy)
  const { open: sidebarOpen } = useSidebar()

  // The agent space steps aside while the boards sidebar is open.
  const agent = (
    <AnimatePresence initial={false}>
      {!sidebarOpen && (
        <motion.aside
          key="agent"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="sticky top-12 hidden w-[320px] shrink-0 self-start lg:block"
        >
          {mode === "critic" ? (
            <CriticPanel sleeping={isIdle} />
          ) : (
            <AgentPanel
              messages={AGENT_MESSAGES}
              mood={isIdle ? "sleeping" : "idle"}
            />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )

  return (
    <div className="flex h-dvh min-w-0 flex-1 flex-col overflow-clip">
      <BoardHeader
        mode={mode}
        onModeChange={setMode}
        aiEnabled={aiEnabled}
        onAiEnabledChange={setAiEnabled}
        graphOpen={screen === "graph"}
        onToggleGraph={() => {
          if (busy) return
          if (screen === "graph") showEditor()
          else showGraph()
        }}
        leading={<NodeBreadcrumb />}
        // The agent panel is hidden while the sidebar is open: flag waiting findings on its toggle.
        attention={sidebarOpen && findingsWaiting}
      />

      {screen === "graph" ? (
        <main className="flex min-h-0 flex-1 px-6 pt-4 pb-6">
          <GraphScreen />
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-full gap-10 px-8 pt-12 pb-24 md:pl-[88px] lg:pr-10">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-8 max-w-3xl items-center justify-end gap-4">
                <NodeMenu />
              </div>

              <TitleField onType={ping} />
              <BodyField onType={ping} />
              <ChangeBar />
              <BranchChips />
            </div>

            {agent}
          </div>
        </main>
      )}
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

/** The body is CodeMirror (loaded on demand, browser only); see body-editor.tsx. */
const BodyEditor = dynamic(() => import("./body-editor"), {
  ssr: false,
  loading: () => <div className="mt-[52px] min-h-[6.8em] w-full max-w-3xl" />,
})

function BodyField({ onType }: { onType: () => void }) {
  return <BodyEditor onType={onType} />
}
