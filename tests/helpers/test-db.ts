import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

import * as schema from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

/** A fresh local SQLite file with every migration applied. Never touches Turso. */
export async function createTestDb(): Promise<{ db: Db; close: () => void }> {
  const file = join(tmpdir(), `engram-test-${crypto.randomUUID()}.db`)
  const client = createClient({ url: `file:${file}` })
  await client.execute("PRAGMA foreign_keys = ON")
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "./drizzle" })

  return {
    db,
    close: () => {
      client.close()
      try {
        rmSync(file, { force: true })
      } catch {
        // Windows may hold the file briefly; it lives in the OS temp folder.
      }
    },
  }
}
