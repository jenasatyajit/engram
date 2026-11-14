import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { hashPassword, verifyPassword } from "@/lib/auth/password"
import {
  ATTEMPT_WINDOW_MS,
  MAX_FAILURES,
  REFRESH_AFTER_MS,
  SESSION_MS,
  clearFailures,
  createSession,
  deleteSession,
  findSession,
  isRateLimited,
  recordFailure,
  refreshSession,
} from "@/lib/auth/session"
import { users } from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

import { createTestDb } from "./helpers/test-db"

let db: Db
let close: () => void
let userId: string

beforeAll(async () => {
  ;({ db, close } = await createTestDb())
  const [user] = await db
    .insert(users)
    .values({
      username: "tester",
      passwordHash: await hashPassword("secret-pw"),
    })
    .returning()
  userId = user.id
})
afterAll(() => close())

describe("passwords", () => {
  it("accepts the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse")
    expect(await verifyPassword("correct horse", hash)).toBe(true)
    expect(await verifyPassword("wrong", hash)).toBe(false)
  })

  it("salts each hash and never stores the password", async () => {
    const a = await hashPassword("same")
    const b = await hashPassword("same")
    expect(a).not.toBe(b)
    expect(a).not.toContain("same")
  })

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false)
    expect(await verifyPassword("x", "")).toBe(false)
  })
})

describe("sessions", () => {
  it("finds a valid session and stores only a hash of the token", async () => {
    const { token } = await createSession(db, userId)
    const found = await findSession(db, token)
    expect(found?.user).toEqual({ id: userId, username: "tester" })
    const rows = await db.query.sessions.findMany()
    expect(rows.some((r) => r.id === token)).toBe(false)
  })

  it("rejects unknown, missing and expired tokens", async () => {
    expect(await findSession(db, undefined)).toBeNull()
    expect(await findSession(db, "nope")).toBeNull()
    const { token } = await createSession(db, userId)
    const later = new Date(Date.now() + SESSION_MS + 1000)
    expect(await findSession(db, token, later)).toBeNull()
  })

  it("ends a session on logout", async () => {
    const { token } = await createSession(db, userId)
    await deleteSession(db, token)
    expect(await findSession(db, token)).toBeNull()
  })

  it("slides the expiry at most once a day", async () => {
    const start = new Date()
    const { token } = await createSession(db, userId, start)
    expect(await refreshSession(db, token, start, start)).toBeNull()
    const later = new Date(start.getTime() + REFRESH_AFTER_MS + 1000)
    const expiresAt = await refreshSession(db, token, start, later)
    expect(expiresAt?.getTime()).toBe(later.getTime() + SESSION_MS)
    expect(await findSession(db, token, later)).not.toBeNull()
  })
})

describe("login rate limit", () => {
  it("blocks after too many failures and resets after the window", async () => {
    const key = "ip:1.2.3.4"
    const now = new Date()
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(await isRateLimited(db, key, now)).toBe(false)
      await recordFailure(db, key, now)
    }
    expect(await isRateLimited(db, key, now)).toBe(true)
    const after = new Date(now.getTime() + ATTEMPT_WINDOW_MS + 1000)
    expect(await isRateLimited(db, key, after)).toBe(false)
  })

  it("clears on success", async () => {
    const key = "ip:5.6.7.8"
    for (let i = 0; i < MAX_FAILURES; i++) await recordFailure(db, key)
    await clearFailures(db, key)
    expect(await isRateLimited(db, key)).toBe(false)
  })
})
