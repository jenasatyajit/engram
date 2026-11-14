import { cookies } from "next/headers"

import { BoardEditor } from "@/components/editor/board-editor"

/** A brand-new board. It is saved once there is a title or a first thought. */
export default async function Page() {
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value === "true"
  return <BoardEditor initialView={null} sidebarOpen={sidebarOpen} />
}
