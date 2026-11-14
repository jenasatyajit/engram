/** Keep only http(s) links; anything else (javascript:, data:, ...) is rejected. */
export function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}

/** "www.example.com" -> "example.com", for short source chips. */
export function displayHost(raw: string) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "")
  } catch {
    return raw
  }
}
