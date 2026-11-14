import { BoardEditor } from "@/components/editor/board-editor"

/** A brand-new board. It is saved once there is a title or a first thought. */
export default function Page() {
  return <BoardEditor initialView={null} />
}
