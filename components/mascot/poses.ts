import type { Transition, Variants } from "motion/react"

/**
 * Every mood the mascot can be in. Add a mood here, then give each part a
 * pose for it in `buildPoses`. TypeScript flags any part that is missing one.
 */
export const MASCOT_MOODS = ["idle", "sleeping", "thinking"] as const
export type MascotMood = (typeof MASCOT_MOODS)[number]

type Poses = Record<MascotMood, Variants[string]>

export type MascotPoses = {
  hair: Poses
  browL: Poses
  browR: Poses
  eyeball: Poses
  eyelid: Poses
  mouth: Poses
}

/** Smooth, non-looping move used when switching into a still pose. */
const settle = (duration: number): Transition => ({
  duration,
  ease: "easeInOut",
})

/**
 * Build the poses for every part. `slow` stretches every duration, so reduced
 * motion keeps the mascot alive but calmer.
 */
export function buildPoses(slow = 1): MascotPoses {
  const loop = (duration: number, times: number[], delay = 0): Transition => ({
    duration: duration * slow,
    times,
    delay,
    ease: "easeInOut",
    repeat: Infinity,
  })

  return {
    hair: {
      idle: {
        rotate: [0, 2.2, -1.6, 0],
        skewX: [0, -1, 0.8, 0],
        transition: loop(4, [0, 0.3, 0.65, 1]),
      },
      sleeping: { rotate: 0, skewX: 0, transition: settle(0.8 * slow) },
      // Thinking: a slower, smaller sway.
      thinking: {
        rotate: [0, 1.2, -0.8, 0],
        skewX: [0, -0.5, 0.4, 0],
        transition: loop(6, [0, 0.3, 0.65, 1]),
      },
    },

    // Brows: quick lift every few seconds while awake, relaxed and flat when asleep.
    browL: {
      idle: {
        y: [0, 0, -12, -12, 0],
        rotate: [0, 0, -5, -5, 0],
        transition: loop(4.5, [0, 0.55, 0.62, 0.72, 1]),
      },
      sleeping: { y: 8, rotate: -16, transition: settle(0.8 * slow) },
      // Thinking: one brow up and held, with a small twitch now and then.
      thinking: {
        y: [-16, -16, -20, -16],
        rotate: [-9, -9, -12, -9],
        transition: loop(2.4, [0, 0.6, 0.75, 1]),
      },
    },
    browR: {
      idle: {
        y: [0, 0, -9, -9, 0],
        rotate: [0, 0, 5, 5, 0],
        transition: loop(4.5, [0, 0.5, 0.58, 0.7, 1], 0.2),
      },
      sleeping: { y: 8, rotate: 16, transition: settle(0.8 * slow) },
      thinking: { y: 4, rotate: 6, transition: settle(0.4) },
    },

    // Eyes close by squashing the eyeball and drawing a lid line over it.
    eyeball: {
      idle: { scaleY: 1, opacity: 1, transition: settle(0.25) },
      sleeping: { scaleY: 0.05, opacity: 0, transition: settle(0.6 * slow) },
      // Thinking: eyes narrow a little.
      thinking: { scaleY: 0.82, opacity: 1, transition: settle(0.3) },
    },
    eyelid: {
      idle: { pathLength: 0, opacity: 0, transition: settle(0.2) },
      sleeping: {
        pathLength: 1,
        opacity: 1,
        transition: { ...settle(0.5 * slow), delay: 0.25 * slow },
      },
      thinking: { pathLength: 0, opacity: 0, transition: settle(0.2) },
    },

    mouth: {
      idle: { scale: 1, transition: settle(0.3) },
      sleeping: { scale: 0.75, transition: settle(0.8 * slow) },
      // Thinking: lips pressed small.
      thinking: { scale: 0.6, transition: settle(0.3) },
    },
  }
}
