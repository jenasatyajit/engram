import { createHash, randomBytes } from "node:crypto"

import { and, eq, gt } from "drizzle-orm"

import { SESSION_COOKIE } from "./constants"
import type { Db } from "@/lib/db/types"
import { loginAttempts, sessions, users } from "@/lib/db/schema"

/*
 * Session and rate-limit logic. Database only, no Next.js imports, so tests
 * can run it against a local SQLite file. Cookie handling is in current-user.ts.
 */

export { SESSION_COOKIE }
export const SESSION_DAYS = 30
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
/** Push the expiry forward at most once a day. */
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

export const MAX_FAILURES = 5
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex")

export type SessionUser = { id: string; username: string }

export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url")
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    createdAt: now,
    refreshedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MS),
  })
  return { token, expiresAt: new Date(now.getTime() + SESSION_MS) }
}

/** The user for a cookie token, or null if the session is missing or expired. */
export async function findSession(
  db: Db,
  token: string | undefined,
  now = new Date()
): Promise<{ user: SessionUser; refreshedAt: Date } | null> {
  if (!token) return null
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      refreshedAt: sessions.refreshedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)))
  if (!row) return null
  return {
    user: { id: row.id, username: row.username },
    refreshedAt: row.refreshedAt,
  }
}

/** Slide the expiry forward. Returns the new expiry, or null if no refresh was due. */
export async function refreshSession(
  db: Db,
  token: string,
  refreshedAt: Date,
  now = new Date()
): Promise<Date | null> {
  if (now.getTime() - refreshedAt.getTime() < REFRESH_AFTER_MS) return null
  const expiresAt = new Date(now.getTime() + SESSION_MS)
  await db
    .update(sessions)
    .set({ refreshedAt: now, expiresAt })
    .where(eq(sessions.id, hashToken(token)))
  return expiresAt
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

export async function deleteUserSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

// ---------- Login rate limit ----------

/** True when this client has used up its failed attempts in the current window. */
export async function isRateLimited(db: Db, key: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
  if (!row) return false
  if (now.getTime() - row.windowStart.getTime() >= ATTEMPT_WINDOW_MS)
    return false
  return row.failures >= MAX_FAILURES
}

export async function recordFailure(db: Db, key: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
  const expired =
    !row || now.getTime() - row.windowStart.getTime() >= ATTEMPT_WINDOW_MS
  if (expired) {
    await db
      .insert(loginAttempts)
      .values({ key, failures: 1, windowStart: now })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: { failures: 1, windowStart: now },
      })
  } else {
    await db
      .update(loginAttempts)
      .set({ failures: row.failures + 1 })
      .where(eq(loginAttempts.key, key))
  }
}

export async function clearFailures(db: Db, key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key))
}
