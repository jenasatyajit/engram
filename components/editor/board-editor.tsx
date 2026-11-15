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

/** One ease for every slide when the AI space comes and goes. */
const SLIDE = { duration: 0.35, ease: [0.32, 0.72, 0, 1] } as const
const AGENT_WIDTH = 320

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

  // The agent space is only there while AI is on and the boards sidebar is closed. It slides
  // out (width, fade and offset share one ease) and the writing column slides across into the space.
  const showAgent = !sidebarOpen && aiEnabled
  const centered = !aiEnabled
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
          <div className="flex min-h-full px-8 pt-12 pb-24 md:pl-[88px] lg:pr-10">
            {/* Takes the free space on the left when AI is off, so the column slides across. */}
            <motion.div
              aria-hidden
              initial={false}
              animate={{ flexGrow: centered ? 1 : 0 }}
              transition={SLIDE}
              className="min-w-0 basis-0"
            />

            <div className="flex w-full max-w-3xl min-w-0 flex-col">
              <div className="flex min-h-8 max-w-3xl items-center justify-end gap-4">
                <NodeMenu />
              </div>

              <TitleField onType={ping} />
              <BodyField onType={ping} />
              <ChangeBar />
              <BranchChips />
            </div>

            <div aria-hidden className="min-w-0 grow basis-0" />
            <motion.div
              initial={false}
              animate={{
                width: showAgent ? AGENT_WIDTH : 0,
                marginLeft: showAgent ? 40 : 0,
              }}
              transition={SLIDE}
              className="sticky top-12 hidden shrink-0 self-start overflow-clip lg:block"
            >
              <AnimatePresence initial={false}>
                {showAgent && (
                  <motion.aside
                    key="agent"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={SLIDE}
                    style={{ width: AGENT_WIDTH }}
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
            </motion.div>
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
