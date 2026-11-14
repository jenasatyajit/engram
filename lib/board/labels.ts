/** First line of a thought, shortened for breadcrumbs, chips and placeholders. */
export function snippet(text: string, max: number) {
  const line = text.trim().split("\n")[0] ?? ""
  if (!line) return "Untitled thought"
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** Longest stored title (placeholders can nest, e.g. "B1: B2: Rust basics"). */
export const MAX_TITLE_LENGTH = 80

/** The name a node is shown with: its title, else the first line of its text. */
export function nodeLabel(
  node: { title: string | null; text: string },
  max = 40
) {
  const title = node.title?.trim()
  if (!title) return snippet(node.text, max)
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title
}

/** Placeholder for a new branch: `B<n>: <parent title>`, n = its branch number under that parent. */
export function branchPlaceholder(branchNumber: number, parentLabel: string) {
  const title = `B${branchNumber}: ${parentLabel.trim()}`
  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : title
}
