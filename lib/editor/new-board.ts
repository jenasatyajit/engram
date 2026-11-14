/*
 * Opening a fresh, empty board.
 *
 * The editor turns "/" into "/b/<id>" with history.replaceState when a new board is first
 * saved, so the cursor and draft stay put. The page on screen is still the "/" page, though,
 * so a plain push to "/" would reuse it and keep the old board's content. Every "new board"
 * link therefore carries a fresh `new` token: app/page.tsx keys the editor by it, so each
 * click mounts a clean editor. The token is removed from the address bar once it's shown.
 */

export const NEW_BOARD_PARAM = "new"

/** Link to a brand-new board that is guaranteed to mount a fresh editor. */
export function newBoardHref() {
  return `/?${NEW_BOARD_PARAM}=${crypto.randomUUID().slice(0, 8)}`
}

/**
 * Hide the token from the address bar. Next's own history state is passed through
 * unchanged, so its router keeps treating this page as the token URL it rendered.
 */
export function stripNewBoardParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(NEW_BOARD_PARAM)) return
  url.searchParams.delete(NEW_BOARD_PARAM)
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash
  )
}
