import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view"

/*
 * Typewriter scrolling for the thought body. As the user types, the caret line drifts down
 * the page; once it passes a fixed "eye level" inside the scrolling pane, the pane scrolls
 * after it so the line being written stays put.
 *
 * - Only typing follows (insert, delete, paste). Arrow keys, clicks and undo do not.
 * - It only ever scrolls down, so editing near the top of a long note never yanks the page.
 * - The follow is a per-frame ease toward the caret's current position, so rapid typing,
 *   wrapping lines and layout changes all converge without a computed end target.
 * - Any wheel, touch or pointer press on the pane cancels it, so the user always wins.
 */

/** Where the caret line settles, as a fraction of the pane height from its top. */
const EYE_LEVEL = 0.5
/** Share of the remaining distance covered per frame (about 150ms to settle). */
const EASE = 0.16
const CANCEL_EVENTS = ["wheel", "touchstart", "pointerdown"] as const

/** The nearest ancestor that actually scrolls vertically. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node
  }
  return null
}

const typedByUser = (update: ViewUpdate) =>
  update.docChanged &&
  update.transactions.some(
    (tr) => tr.isUserEvent("input") || tr.isUserEvent("delete")
  )

export function typewriterScroll() {
  return ViewPlugin.fromClass(
    class {
      private frame = 0
      private pane: HTMLElement | null = null
      private readonly reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      )

      constructor(private readonly view: EditorView) {}

      update(update: ViewUpdate) {
        if (!typedByUser(update) || !update.view.hasFocus) return
        if (this.frame) return // already following; the loop reads the live caret
        const pane = scrollParent(this.view.dom)
        if (!pane) return
        this.pane = pane
        for (const type of CANCEL_EVENTS)
          pane.addEventListener(type, this.cancel, { passive: true })
        this.frame = requestAnimationFrame(this.step)
      }

      /** Distance (px) the caret line sits below eye level; <= 0 means nothing to do. */
      private overshoot(pane: HTMLElement) {
        const caret = this.view.coordsAtPos(
          this.view.state.selection.main.head
        )
        if (!caret) return 0
        const box = pane.getBoundingClientRect()
        const eye = box.top + pane.clientHeight * EYE_LEVEL
        return (caret.top + caret.bottom) / 2 - eye
      }

      private readonly step = () => {
        this.frame = 0
        const pane = this.pane
        if (!pane || !pane.isConnected) return this.stop()
        const delta = this.overshoot(pane)
        if (delta < 1) return this.stop()

        const before = pane.scrollTop
        pane.scrollTop += this.reduceMotion.matches
          ? delta
          : Math.min(delta, Math.max(1, delta * EASE))
        if (pane.scrollTop === before) return this.stop() // hit the end of the page
        this.frame = requestAnimationFrame(this.step)
      }

      private readonly cancel = () => this.stop()

      private stop() {
        if (this.frame) cancelAnimationFrame(this.frame)
        this.frame = 0
        if (this.pane)
          for (const type of CANCEL_EVENTS)
            this.pane.removeEventListener(type, this.cancel)
        this.pane = null
      }

      destroy() {
        this.stop()
      }
    }
  )
}
