import { z } from "zod"

export const reviewBoardInput = z.object({
  boardId: z.uuid(),
  /** The node the owner just left; the review starts there. */
  focusNodeId: z.uuid().nullable().optional(),
})

export const findingIdInput = z.object({ findingId: z.uuid() })
