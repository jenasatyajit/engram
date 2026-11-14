"use client"

import { motion } from "motion/react"

const LETTERS = [
  { size: 95, delay: 0 },
  { size: 120, delay: 1 },
  { size: 145, delay: 2 },
]

/** Three "z" letters drifting up and to the right from above the head, on a loop. */
export function Zzz({ slow = 1 }: { slow?: number }) {
  const duration = 3 * slow

  return (
    <motion.g
      data-part="zzz"
      className="text-muted-foreground"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      {LETTERS.map(({ size, delay }, i) => (
        <motion.text
          key={i}
          x={870}
          y={480}
          fontSize={size}
          fontWeight={700}
          fill="currentColor"
          style={{ fontFamily: "var(--font-sans)" }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: [0, 60, 110, 150],
            y: [0, -90, -170, -240],
            scale: [0.5, 0.85, 1, 1.1],
            transition: {
              duration,
              times: [0, 0.25, 0.7, 1],
              delay: delay * slow,
              ease: "easeOut",
              repeat: Infinity,
            },
          }}
        >
          z
        </motion.text>
      ))}
    </motion.g>
  )
}
