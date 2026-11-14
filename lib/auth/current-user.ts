import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"

import { db } from "@/lib/db/client"

import {
  SESSION_COOKIE,
  findSession,
  refreshSession,
  type SessionUser,
} from "./session"

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  }
}

/**
 * The logged-in user, or null. Read-only: safe in server components.
 * The proxy only checks that a cookie exists; this checks it against the database.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const found = await findSession(db, token)
  return found?.user ?? null
})

/**
 * For server actions: returns the user and slides the session forward
 * (cookies can only be written in actions and route handlers).
 */
export async function requireUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const found = await findSession(db, token)
  if (!found || !token) return null
  const expiresAt = await refreshSession(db, token, found.refreshedAt)
  if (expiresAt) jar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  return found.user
}
