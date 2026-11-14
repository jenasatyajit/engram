import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { BoardEditor } from "@/components/editor/board-editor"
import { getCurrentUser } from "@/lib/auth/current-user"
import { NEW_BOARD_PARAM } from "@/lib/editor/new-board"

/**
 * A brand-new board. It is saved once there is a title or a first thought.
 * `?new=<token>` comes from "New board": keying the editor by it mounts a fresh,
 * empty editor on every click (see lib/editor/new-board.ts).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await getCurrentUser())) redirect("/login")
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value === "true"
  const token = (await searchParams)[NEW_BOARD_PARAM]
  return (
    <BoardEditor
      key={typeof token === "string" ? token : "home"}
      initialView={null}
      sidebarOpen={sidebarOpen}
    />
  )
}
