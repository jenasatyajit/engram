"use client"

import { useEffect, useState } from "react"

export type TypewriterPhase = "typing" | "holding" | "erasing"

type Options = {
  /** How long a fully typed message stays before erasing. */
  holdMs?: number
  /** Typing speed, per character. */
  typeMsPerChar?: number
  /** Erasing speed, per character. Faster than typing reads better. */
  eraseMsPerChar?: number
  /** While true, a fully typed message stays put instead of moving on. */
  paused?: boolean
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Cycles through `messages` with a typewriter effect:
 * type in, hold, erase, then type the next one. Typing and erasing both use
 * an ease-out curve (fast start, gentle finish).
 */
export function useTypewriterCycle(
  messages: readonly string[],
  {
    holdMs = 7000,
    typeMsPerChar = 32,
    eraseMsPerChar = 14,
    paused = false,
  }: Options = {}
) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<TypewriterPhase>("typing")
  const [count, setCount] = useState(0)

  const text = messages[index % messages.length] ?? ""

  // Typing and erasing: animate the visible character count.
  useEffect(() => {
    if (phase === "holding") return

    const len = text.length
    const duration = Math.max(
      1,
      len * (phase === "typing" ? typeMsPerChar : eraseMsPerChar)
    )
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const shown = Math.round(easeOutCubic(t) * len)
      setCount(phase === "typing" ? shown : len - shown)

      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else if (phase === "typing") {
        setPhase("holding")
      } else {
        setIndex((i) => (i + 1) % messages.length)
        setPhase("typing")
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, text, typeMsPerChar, eraseMsPerChar, messages.length])

  // Holding: wait, then start erasing (unless paused or nothing to rotate to).
  useEffect(() => {
    if (phase !== "holding" || paused || messages.length < 2) return
    const timer = setTimeout(() => setPhase("erasing"), holdMs)
    return () => clearTimeout(timer)
  }, [phase, paused, holdMs, messages.length])

  return { text, visible: text.slice(0, count), phase }
}
