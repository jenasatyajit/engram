import type { Target } from "./store"

/*
 * Unsaved drafts live in localStorage so closing the tab never loses text.
 * One entry per board + target; cleared once the draft is saved or discarded.
 */

type LocalDraft = { text: string; note: string }

const PREFIX = "engram:draft:"

function keyFor(boardId: string | null, target: Target) {
  const slot =
    target.kind === "node"
      ? target.nodeId
      : `new:${target.parentId ?? "root"}${target.type ? `:${target.type}` : ""}`
  return `${PREFIX}${boardId ?? "unsaved"}:${slot}`
}

export function readLocalDraft(
  boardId: string | null,
  target: Target
): LocalDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(keyFor(boardId, target))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalDraft>
    return typeof parsed.text === "string"
      ? {
          text: parsed.text,
          note: typeof parsed.note === "string" ? parsed.note : "",
        }
      : null
  } catch {
    return null
  }
}

export function writeLocalDraft(
  boardId: string | null,
  target: Target,
  draft: LocalDraft
) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(keyFor(boardId, target), JSON.stringify(draft))
  } catch {
    // Storage full or blocked: the draft still lives in memory.
  }
}

export function clearLocalDraft(boardId: string | null, target: Target) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(keyFor(boardId, target))
  } catch {
    // ignore
  }
}
