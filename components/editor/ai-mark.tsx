import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

/** Marks AI-written content (SPEC.md principle 4). */
export function AiMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      title="Title written by AI"
    >
      <HugeiconsIcon
        icon={SparklesIcon}
        strokeWidth={2}
        className="size-3 opacity-60"
        aria-hidden
      />
      <span className="sr-only">AI title</span>
    </span>
  )
}
