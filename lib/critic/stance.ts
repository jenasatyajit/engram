import type { NodeType, Stance } from "@/lib/db/schema"

/*
 * Critic stance rules (SPEC.md 6.2, D24). A stance is always relative to the
 * parent node: For supports it, Against attacks it. The node type carries it.
 */

export type ArgumentType = "evidence" | "objection" | "defense"

/** Node type for a new For/Against argument under a parent of `parentType`. */
export function argumentTypeFor(
  stance: Stance,
  parentType: NodeType | null
): ArgumentType {
  if (stance === "for") return "evidence"
  // Arguing against an objection is a rebuttal.
  return parentType === "objection" ? "defense" : "objection"
}

/** The stance a node takes towards its parent, or null for non-argument nodes. */
export function stanceOf(type: NodeType | null): Stance | null {
  if (type === "evidence") return "for"
  if (type === "objection" || type === "defense") return "against"
  return null
}

/** Short role label used in the AI context and in the UI. */
export function roleOf(type: NodeType | null, isRoot: boolean) {
  if (type === "evidence") return "FOR its parent"
  if (type === "objection") return "AGAINST its parent"
  if (type === "defense") return "AGAINST its parent (rebuttal)"
  if (type === "verdict") return "owner's verdict"
  if (isRoot) return "claim description"
  return type ?? "thought"
}
