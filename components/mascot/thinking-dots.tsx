"use client"

import { motion } from "motion/react"

const DOTS = [0, 1, 2]

/** Three dots above the head that pulse in turn, like a thought bubble. */
export function ThinkingDots({ slow = 1 }: { slow?: number }) {
  return (
    <motion.g
      data-part="thinking-dots"
      className="text-muted-foreground"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      {DOTS.map((i) => (
        <motion.circle
          key={i}
          cx={860 + i * 62}
          cy={360 - i * 34}
          r={20 + i * 4}
          fill="currentColor"
          initial={{ opacity: 0.25, scale: 0.8 }}
          animate={{
            opacity: [0.25, 1, 0.25],
            scale: [0.8, 1.05, 0.8],
            transition: {
              duration: 1.2 * slow,
              delay: i * 0.2 * slow,
              ease: "easeInOut",
              repeat: Infinity,
            },
          }}
        />
      ))}
    </motion.g>
  )
}
