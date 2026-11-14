"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  Note01Icon,
  PencilEdit02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import * as actions from "@/app/actions/boards"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import { LIMITS } from "@/lib/board/inputs"
import type { NodeView } from "@/lib/board/repo"
import type { Board } from "@/lib/db/schema"
import { useEditor } from "@/lib/editor/provider"
import { anchorNodeId } from "@/lib/editor/store"

import { NodeTree } from "./node-tree"

export const SIDEBAR_WIDTH = 280

const boardName = (title: string) => title.trim() || "Untitled board"

/**
 * Boards sidebar. Slides open with Motion and pushes the writing area aside.
 * Open/closed state, the cookie that remembers it, and Ctrl+B come from shadcn's SidebarProvider.
 */
export function AppSidebar() {
  const { open, openMobile, isMobile } = useSidebar()
  const isOpen = isMobile ? openMobile : open
  const reduced = useReducedMotion()

  return (
    <motion.aside
      aria-label="Boards"
      aria-hidden={!isOpen}
      inert={!isOpen}
      initial={false}
      animate={{ width: isOpen ? SIDEBAR_WIDTH : 0 }}
      transition={
        reduced
          ? { duration: 0.15 }
          : { type: "spring", stiffness: 420, damping: 40 }
      }
      className="relative h-svh shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground data-[closed=true]:border-r-0"
      data-closed={!isOpen}
    >
      <motion.div
        initial={false}
        animate={{ opacity: isOpen ? 1 : 0, x: isOpen ? 0 : -16 }}
        transition={{
          duration: 0.2,
          ease: "easeOut",
          delay: isOpen ? 0.05 : 0,
        }}
        className="flex h-full flex-col"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {isOpen && <SidebarBody />}
      </motion.div>
    </motion.aside>
  )
}

function SidebarBody() {
  const router = useRouter()
  const currentBoardId = useEditor((s) => s.boardId)
  const savedTitle = useEditor((s) => s.savedTitle)
  const view = useEditor((s) => s.view)
  const target = useEditor((s) => s.target)
  const leaveNode = useEditor((s) => s.leaveNode)
  const goTo = useEditor((s) => s.goTo)
  const showEditor = useEditor((s) => s.showEditor)
  const setTitle = useEditor((s) => s.setTitle)
  const commitTitle = useEditor((s) => s.commitTitle)

  const [boards, setBoards] = useState<Board[] | null>(null)
  const [query, setQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Reload the list when the current board is created or renamed, or after changes here.
  useEffect(() => {
    let cancelled = false
    actions.listBoards().then((result) => {
      if (cancelled) return
      if (result.ok) setBoards(result.data)
      else toast.error(result.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [currentBoardId, savedTitle, refreshKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!boards) return null
    return q
      ? boards.filter((b) => boardName(b.title).toLowerCase().includes(q))
      : boards
  }, [boards, query])

  /** Leave the current node (auto-saving edits), then go to another URL. */
  const navigate = async (href: string) => {
    if (!(await leaveNode())) return
    router.push(href)
  }

  const openNode = async (boardId: string, nodeId: string) => {
    if (boardId === currentBoardId) {
      await goTo({ kind: "node", nodeId })
      showEditor()
    } else {
      await navigate(`/b/${boardId}?node=${nodeId}`)
    }
  }

  const rename = async (board: Board, title: string) => {
    if (board.id === currentBoardId) {
      setTitle(title)
      await commitTitle()
      return
    }
    const result = await actions.renameBoard({ boardId: board.id, title })
    if (!result.ok) return void toast.error(result.error.message)
    refresh()
  }

  const remove = async (board: Board) => {
    const result = await actions.deleteBoard({ boardId: board.id })
    if (!result.ok) return void toast.error(result.error.message)
    const wasCurrent = board.id === currentBoardId
    toast(`Deleted "${boardName(board.title)}"`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const undo = await actions.restoreBoard({ boardId: board.id })
          if (!undo.ok) return void toast.error(undo.error.message)
          if (wasCurrent) router.push(`/b/${board.id}`)
          else refresh()
        },
      },
    })
    if (wasCurrent) router.push("/")
    else refresh()
  }

  return (
    <>
      <SidebarHeader className="px-3 pt-4 pb-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-sidebar-foreground/50"
          />
          <SidebarInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search boards"
            aria-label="Search boards"
            className="h-9 pl-8"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">Boards</SidebarGroupLabel>
          <SidebarMenu>
            {filtered === null &&
              Array.from({ length: 3 }, (_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}

            {filtered?.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-sidebar-foreground/50">
                {query ? "No boards match" : "No boards yet"}
              </p>
            )}

            {filtered?.map((board) => (
              <BoardItem
                key={board.id}
                board={board}
                isCurrent={board.id === currentBoardId}
                currentNodes={
                  board.id === currentBoardId ? (view?.nodes ?? []) : null
                }
                activeNodeId={
                  board.id === currentBoardId ? anchorNodeId(target) : null
                }
                onOpenBoard={() =>
                  board.id === currentBoardId
                    ? showEditor()
                    : navigate(`/b/${board.id}`)
                }
                onOpenNode={(nodeId) => openNode(board.id, nodeId)}
                onRename={(title) => rename(board, title)}
                onDelete={() => remove(board)}
              />
            ))}

            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => (currentBoardId ? navigate("/") : showEditor())}
                className="text-sidebar-foreground/80"
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                <span>New board</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}

function BoardItem({
  board,
  isCurrent,
  currentNodes,
  activeNodeId,
  onOpenBoard,
  onOpenNode,
  onRename,
  onDelete,
}: {
  board: Board
  isCurrent: boolean
  /** The open board's live nodes (from the editor); null for other boards (loaded on expand). */
  currentNodes: NodeView[] | null
  activeNodeId: string | null
  onOpenBoard: () => void
  onOpenNode: (nodeId: string) => void
  onRename: (title: string) => Promise<void>
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(isCurrent)
  const [loadedNodes, setLoadedNodes] = useState<NodeView[] | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(board.title)

  // Other boards: load their thoughts the first time the dropdown opens.
  useEffect(() => {
    if (!expanded || currentNodes || loadedNodes) return
    let cancelled = false
    actions.getBoard({ boardId: board.id }).then((result) => {
      if (cancelled) return
      if (result.ok) setLoadedNodes(result.data.nodes)
      else toast.error(result.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [expanded, currentNodes, loadedNodes, board.id])

  const nodes = currentNodes ?? loadedNodes

  if (renaming) {
    const finish = async (save: boolean) => {
      setRenaming(false)
      if (save && draftTitle.trim() !== board.title.trim())
        await onRename(draftTitle.trim())
    }
    return (
      <SidebarMenuItem>
        <SidebarInput
          autoFocus
          value={draftTitle}
          maxLength={LIMITS.title}
          aria-label="Board name"
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(true)
            if (e.key === "Escape") {
              setDraftTitle(board.title)
              finish(false)
            }
          }}
          className="h-8"
        />
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isCurrent}
          onClick={onOpenBoard}
          className="h-9 pr-14 text-[15px] data-active:font-semibold"
          title={boardName(board.title)}
        >
          <HugeiconsIcon icon={Note01Icon} strokeWidth={1.75} />
          <span className="truncate">{boardName(board.title)}</span>
        </SidebarMenuButton>

        <CollapsibleTrigger
          render={
            <SidebarMenuAction
              aria-label={expanded ? "Hide thoughts" : "Show thoughts"}
              className="right-7 [&[data-panel-open]>svg]:rotate-90"
            />
          }
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="transition-transform duration-200"
          />
        </CollapsibleTrigger>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction showOnHover aria-label="Board options" />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-40">
            <DropdownMenuItem
              onClick={() => {
                setDraftTitle(board.title)
                setRenaming(true)
              }}
            >
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <CollapsibleContent>
          {nodes ? (
            <NodeTree
              nodes={nodes}
              activeNodeId={activeNodeId}
              onOpen={onOpenNode}
            />
          ) : (
            <SidebarMenuSkeleton className="ml-6" />
          )}
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}
