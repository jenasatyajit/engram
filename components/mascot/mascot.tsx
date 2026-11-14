"use client"

import { useId, useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { buildPoses, type MascotMood } from "./poses"
import { ThinkingDots } from "./thinking-dots"
import { Zzz } from "./zzz"

const SKIN = "#fcc091"
const DARK = "#55301b"
const EYE_WHITE = "#fff3e6"
const GOLD = "#ffb800"
const TILAKA = "#dc4410"

type MascotProps = {
  mood?: MascotMood
  className?: string
}

/**
 * Chanakya mascot. `mood` sets the pose; each part animates to its pose for
 * that mood (see poses.ts). Parts are tagged with data-part for debugging.
 */
export function Mascot({ mood = "idle", className }: MascotProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const reduced = useReducedMotion()
  const slow = reduced ? 2 : 1
  const poses = useMemo(() => buildPoses(slow), [slow])

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="190 285 830 655"
      overflow="visible"
      role="img"
      aria-label={
        mood === "sleeping"
          ? "Mascot, sleeping"
          : mood === "thinking"
            ? "Mascot, thinking"
            : "Mascot"
      }
      className={className}
      initial={false}
      animate={mood}
    >
      <defs>
        <clipPath id={`clipL${uid}`}>
          <circle cx="0" cy="0" r="62" />
        </clipPath>
        <clipPath id={`clipR${uid}`}>
          <circle cx="0" cy="0" r="62" />
        </clipPath>
      </defs>

      <g data-part="rig">
        <motion.path
          data-part="hair"
          fill={DARK}
          variants={poses.hair}
          style={{ originX: 0.88, originY: 0 }}
          d="M 690 300 C 600 300 500 345 440 430 C 410 475 392 515 385 545 C 382 560 372 568 360 575 C 320 605 292 650 292 700 C 292 725 300 740 298 748 C 296 765 270 770 255 795 C 235 825 240 880 285 912 C 280 890 300 855 335 858 C 370 862 395 878 440 870 C 470 862 485 845 495 832 L 560 700 Z"
        />

        <circle data-part="ear-l" cx="418" cy="692" r="62" fill={SKIN} />
        <circle data-part="ear-r" cx="945" cy="688" r="62" fill={SKIN} />

        <path
          data-part="head"
          fill={SKIN}
          d="M 685 300 C 830 300 940 410 940 590 C 940 760 840 897 685 897 C 540 897 428 780 428 590 C 428 410 540 300 685 300 Z"
        />

        <path
          data-part="earring-l"
          fill="none"
          stroke={GOLD}
          strokeWidth="18"
          strokeLinecap="round"
          d="M 421 750 A 30 30 0 1 0 445 746"
        />
        <path
          data-part="earring-r"
          fill="none"
          stroke={GOLD}
          strokeWidth="18"
          strokeLinecap="round"
          d="M 919 746 A 30 30 0 1 0 943 750"
        />

        <path
          data-part="tilaka"
          fill={TILAKA}
          d="M 646 435 C 632 470 628 520 640 555 C 650 585 675 598 690 598 C 705 598 730 585 740 555 C 752 520 746 470 734 435 C 736 480 731 512 722 534 C 715 549 705 552 690 552 C 675 552 665 549 658 534 C 649 512 644 480 646 435 Z"
        />

        <g data-part="face">
          <Eye
            side="l"
            x={581}
            y={688}
            pupilX={1}
            clipId={`clipL${uid}`}
            poses={poses}
          />
          <Eye
            side="r"
            x={792}
            y={686}
            pupilX={-2}
            clipId={`clipR${uid}`}
            poses={poses}
          />

          <g data-part="brow-l" transform="translate(586 636) rotate(20)">
            <motion.path
              variants={poses.browL}
              d="M -46 0 Q 0 -10 46 0"
              fill="none"
              stroke={DARK}
              strokeWidth="31"
              strokeLinecap="round"
            />
          </g>
          <g data-part="brow-r" transform="translate(789 638) rotate(-20)">
            <motion.path
              variants={poses.browR}
              d="M -46 0 Q 0 -10 46 0"
              fill="none"
              stroke={DARK}
              strokeWidth="31"
              strokeLinecap="round"
            />
          </g>

          <g data-part="mouth" transform="translate(690 756)">
            <motion.path
              variants={poses.mouth}
              d="M -33 -6 Q 0 22 33 -6 Q 0 22 -33 -6 Z"
              fill={DARK}
              stroke={DARK}
              strokeWidth="11"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        </g>
      </g>

      <AnimatePresence>
        {mood === "sleeping" && <Zzz key="zzz" slow={slow} />}
        {mood === "thinking" && <ThinkingDots key="dots" slow={slow} />}
      </AnimatePresence>
    </motion.svg>
  )
}

type EyeProps = {
  side: "l" | "r"
  x: number
  y: number
  pupilX: number
  clipId: string
  poses: ReturnType<typeof buildPoses>
}

function Eye({ side, x, y, pupilX, clipId, poses }: EyeProps) {
  return (
    <g data-part={`eye-${side}`} transform={`translate(${x} ${y})`}>
      <motion.g data-part={`eyeball-${side}`} variants={poses.eyeball}>
        <circle r="62" fill={EYE_WHITE} />
        <g clipPath={`url(#${clipId})`}>
          <circle
            data-part={`pupil-${side}`}
            cx={pupilX}
            cy="-2"
            r="44"
            fill={DARK}
          />
        </g>
      </motion.g>
      <motion.path
        data-part={`eyelid-${side}`}
        variants={poses.eyelid}
        d="M -48 0 Q 0 34 48 0"
        fill="none"
        stroke={DARK}
        strokeWidth="16"
        strokeLinecap="round"
      />
    </g>
  )
}
