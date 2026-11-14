"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Tracks inactivity. Call `ping()` on user activity (e.g. each keystroke).
 * `isIdle` turns true after `timeoutMs` without a ping, and false on the next ping.
 * The timer starts on mount, so a fresh page also counts as idle after `timeoutMs`.
 */
export function useIdle(timeoutMs: number) {
  const [isIdle, setIsIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setIsIdle(true), timeoutMs)
  }, [timeoutMs])

  const ping = useCallback(() => {
    // Same-value setState bails out, so this does not re-render on every keystroke.
    setIsIdle(false)
    schedule()
  }, [schedule])

  useEffect(() => {
    schedule()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [schedule])

  return { isIdle, ping }
}
