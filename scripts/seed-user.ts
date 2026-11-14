/**
 * Creates the login user, or resets its password if it already exists.
 * Reads SEED_USERNAME and SEED_PASSWORD from .env.local (never hardcode them).
 * Resetting also logs the user out everywhere.
 *
 * Run: pnpm db:seed-user
 */
import { createClient } from "@libsql/client"
import { config } from "dotenv"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"

import { hashPassword } from "../lib/auth/password"
import * as schema from "../lib/db/schema"

config({ path: ".env.local", quiet: true })

const username = process.env.SEED_USERNAME?.trim()
const password = process.env.SEED_PASSWORD

if (!username || !password) {
  console.error("Set SEED_USERNAME and SEED_PASSWORD in .env.local first.")
  process.exit(1)
}
if (password.length < 8) {
  console.error("SEED_PASSWORD must be at least 8 characters.")
  process.exit(1)
}
if (!process.env.TURSO_DATABASE_URL) {
  console.error("TURSO_DATABASE_URL is not set.")
  process.exit(1)
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})
const db = drizzle(client, { schema })
const { users, sessions } = schema

const passwordHash = await hashPassword(password)
const [existing] = await db
  .select()
  .from(users)
  .where(eq(users.username, username))

if (existing) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id))
  await db.delete(sessions).where(eq(sessions.userId, existing.id))
  console.log(`Updated password for "${username}" and ended its sessions.`)
} else {
  await db.insert(users).values({ username, passwordHash })
  console.log(`Created user "${username}".`)
}
client.close()
