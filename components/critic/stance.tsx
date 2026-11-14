import { stanceOf } from "@/lib/critic/stance"
import type { NodeType } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

/** Human name of an argument's role, for badges and labels. */
export function argumentRoleLabel(type: NodeType | null) {
  if (type === "evidence") return "For"
  if (type === "objection") return "Against"
  if (type === "defense") return "Rebuttal"
  if (type === "verdict") return "Verdict"
  return null
}

/** Colour class for a node type's stance (green For, red Against, amber verdict). */
export function stanceColor(type: NodeType | null) {
  const stance = stanceOf(type)
  if (stance === "for") return "bg-stance-for"
  if (stance === "against") return "bg-stance-against"
  if (type === "verdict") return "bg-stance-verdict"
  return null
}

/** Small coloured dot showing a node's stance towards its parent. Renders nothing for plain thoughts. */
export function StanceDot({
  type,
  className,
}: {
  type: NodeType | null
  className?: string
}) {
  const color = stanceColor(type)
  const label = argumentRoleLabel(type)
  if (!color || !label) return null
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        color,
        className
      )}
      title={label}
      aria-label={label}
      role="img"
    />
  )
}
