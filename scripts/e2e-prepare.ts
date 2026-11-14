/**
 * Prepares a THROWAWAY database for the browser e2e run: applies every migration
 * and creates a login user. Refuses anything that isn't a local file.
 *
 *   pnpm exec tsx scripts/e2e-prepare.ts <db-file> <username> <password>
 */
import { rmSync } from "node:fs"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

import { hashPassword } from "../lib/auth/password"
import * as schema from "../lib/db/schema"

const [file, username, password] = process.argv.slice(2)
if (!file || !username || !password) {
  console.error(
    "usage: tsx scripts/e2e-prepare.ts <db-file> <username> <password>"
  )
  process.exit(1)
}
if (/^(libsql|https?|wss?):/i.test(file)) {
  console.error("e2e-prepare only works on a local database file.")
  process.exit(1)
}

for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  rmSync(`${file}${suffix}`, { force: true })
}

const client = createClient({ url: `file:${file.replace(/\\/g, "/")}` })
const db = drizzle(client, { schema })
await migrate(db, { migrationsFolder: "./drizzle" })
await db
  .insert(schema.users)
  .values({ username, passwordHash: await hashPassword(password) })
client.close()
console.log(`e2e database ready: ${file}`)
