import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { z } from "zod"

import { BoardEditor } from "@/components/editor/board-editor"
import { BoardError, getBoard } from "@/lib/board/repo"
import { db } from "@/lib/db/client"

export const dynamic = "force-dynamic"

/** Open an existing board. `?node=<id>` opens that thought instead of the most recent one. */
export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>
  searchParams: Promise<{ node?: string | string[] }>
}) {
  const { boardId } = await params
  if (!z.uuid().safeParse(boardId).success) notFound()

  const { node } = await searchParams
  const nodeId =
    typeof node === "string" && z.uuid().safeParse(node).success ? node : null
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value === "true"

  const view = await getBoard(db, boardId).catch((error: unknown) => {
    if (error instanceof BoardError && error.code === "NOT_FOUND") notFound()
    throw error
  })

  return (
    <BoardEditor
      key={`${boardId}:${nodeId ?? ""}`}
      initialView={view}
      initialNodeId={nodeId}
      sidebarOpen={sidebarOpen}
    />
  )
}
