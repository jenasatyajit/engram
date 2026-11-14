import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { BoardEditor } from "@/components/editor/board-editor"
import { getCurrentUser } from "@/lib/auth/current-user"

/** A brand-new board. It is saved once there is a title or a first thought. */
export default async function Page() {
  if (!(await getCurrentUser())) redirect("/login")
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value === "true"
  return <BoardEditor initialView={null} sidebarOpen={sidebarOpen} />
}
