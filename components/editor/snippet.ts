/** First line of a thought, shortened for breadcrumbs and chips. */
export function snippet(text: string, max: number) {
  const line = text.trim().split("\n")[0] ?? ""
  if (!line) return "Untitled thought"
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}
