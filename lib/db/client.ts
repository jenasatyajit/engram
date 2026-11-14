import "server-only"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

import * as schema from "./schema"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to .env.local (see SPEC.md section 9).`
    )
  }
  return value
}

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as {
  libsql?: ReturnType<typeof createClient>
}

const client =
  globalForDb.libsql ??
  createClient({
    url: requireEnv("TURSO_DATABASE_URL"),
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

if (process.env.NODE_ENV !== "production") globalForDb.libsql = client

/** Server-only database handle. Never import this from client components. */
export const db = drizzle(client, { schema })
