import { notFound } from "next/navigation"
import { z } from "zod"

import { BoardEditor } from "@/components/editor/board-editor"
import { BoardError, getBoard } from "@/lib/board/repo"
import { db } from "@/lib/db/client"

export const dynamic = "force-dynamic"

/** Open an existing board. */
export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>
}) {
  const { boardId } = await params
  if (!z.uuid().safeParse(boardId).success) notFound()

  const view = await getBoard(db, boardId).catch((error: unknown) => {
    if (error instanceof BoardError && error.code === "NOT_FOUND") notFound()
    throw error
  })

  return <BoardEditor key={boardId} initialView={view} />
}
