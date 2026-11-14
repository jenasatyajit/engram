import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

/** Marks AI-written content (SPEC.md principle 4). */
export function AiMark({
  className,
  label = "Title written by AI",
}: {
  className?: string
  label?: string
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      title={label}
    >
      <HugeiconsIcon
        icon={SparklesIcon}
        strokeWidth={2}
        className="size-3 opacity-60"
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}
