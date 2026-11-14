import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/lib/auth/constants"

/*
 * First, cheap check: no session cookie means no access. This does not touch
 * the database. Every page and server action verifies the session again
 * (lib/auth/current-user.ts), so a forged cookie gets nothing.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === "/login") return NextResponse.next()
  if (hasCookie) return NextResponse.next()

  // A server action call cannot follow a redirect to a page.
  if (request.headers.has("next-action")) {
    return new NextResponse(null, { status: 401 })
  }
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  // Skip Next internals and public files (icons, logo and manifest must stay reachable for link previews).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|txt)$).*)",
  ],
}
