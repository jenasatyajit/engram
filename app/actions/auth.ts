"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { sessionCookieOptions } from "@/lib/auth/current-user"
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password"
import { SESSION_COOKIE } from "@/lib/auth/constants"
import {
  clearFailures,
  createSession,
  deleteSession,
  isRateLimited,
  recordFailure,
} from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { users } from "@/lib/db/schema"

export type LoginState = { error: string } | null

const loginInput = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
})

const GENERIC_ERROR = "Wrong username or password."

async function clientKey() {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim()
  return `ip:${ip || h.get("x-real-ip") || "unknown"}`
}

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginInput.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: GENERIC_ERROR }

  const key = await clientKey()
  if (await isRateLimited(db, key)) {
    return { error: "Too many attempts. Try again in a few minutes." }
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, parsed.data.username))
  // Always run a hash comparison so a missing user takes as long as a wrong password.
  const ok = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH
  )
  if (!user || !ok) {
    await recordFailure(db, key)
    return { error: GENERIC_ERROR }
  }

  await clearFailures(db, key)
  const { token, expiresAt } = await createSession(db, user.id)
  ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  redirect("/")
}

export async function logout() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await deleteSession(db, token)
  jar.delete(SESSION_COOKIE)
  redirect("/login")
}
