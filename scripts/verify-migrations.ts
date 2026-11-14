/**
 * Applies every migration in ./drizzle to a throwaway local SQLite file and
 * checks the database-level rules. Never touches the Turso database.
 *
 * Run: pnpm db:verify
 */
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

import * as schema from "../lib/db/schema"

const file = join(tmpdir(), `engram-verify-${Date.now()}.db`)
const client = createClient({ url: `file:${file}` })
const db = drizzle(client, { schema })

let failures = 0
function check(name: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`
  )
  if (!ok) failures++
}

async function expectError(
  name: string,
  run: () => Promise<unknown>,
  match: RegExp
) {
  try {
    await run()
    check(name, false, "no error raised")
  } catch (error) {
    const message = String((error as { cause?: unknown }).cause ?? error)
    check(name, match.test(message), message.split("\n")[0])
  }
}

async function main() {
  await client.execute("PRAGMA foreign_keys = ON")
  await migrate(db, { migrationsFolder: "./drizzle" })

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type IN ('table','trigger') ORDER BY name"
  )
  console.log("objects:", tables.rows.map((r) => r.name).join(", "))

  const [board] = await db
    .insert(schema.boards)
    .values({ title: "test" })
    .returning()
  const [root] = await db
    .insert(schema.nodes)
    .values({ boardId: board.id, createdBy: "owner" })
    .returning()
  const [child] = await db
    .insert(schema.nodes)
    .values({ boardId: board.id, createdBy: "owner" })
    .returning()
  const [other] = await db
    .insert(schema.nodes)
    .values({ boardId: board.id, createdBy: "owner" })
    .returning()
  const [v1] = await db
    .insert(schema.nodeVersions)
    .values({ nodeId: root.id, text: "first", author: "owner" })
    .returning()
  await db.insert(schema.nodeVersions).values({
    nodeId: root.id,
    text: "second",
    author: "owner",
    note: "refined",
  })
  check("versions append", true)

  await expectError(
    "versions cannot be updated",
    () =>
      db
        .update(schema.nodeVersions)
        .set({ text: "x" })
        .where(eq(schema.nodeVersions.id, v1.id)),
    /append-only/
  )
  await expectError(
    "versions cannot be deleted",
    () =>
      db.delete(schema.nodeVersions).where(eq(schema.nodeVersions.id, v1.id)),
    /append-only/
  )
  await expectError(
    "nodes cannot be hard-deleted",
    () => db.delete(schema.nodes).where(eq(schema.nodes.id, other.id)),
    /soft-deleted/
  )

  await db
    .update(schema.nodes)
    .set({ deletedAt: new Date() })
    .where(eq(schema.nodes.id, other.id))
  check("nodes can be soft-deleted", true)

  const edge = {
    boardId: board.id,
    toNodeId: child.id,
    kind: "child" as const,
    createdBy: "owner" as const,
  }
  const [firstParent] = await db
    .insert(schema.connections)
    .values({ ...edge, fromNodeId: root.id })
    .returning()
  await expectError(
    "a node cannot have two live parents",
    () =>
      db.insert(schema.connections).values({ ...edge, fromNodeId: other.id }),
    /UNIQUE/
  )
  await db
    .update(schema.connections)
    .set({ deletedAt: new Date() })
    .where(eq(schema.connections.id, firstParent.id))
  await db.insert(schema.connections).values({ ...edge, fromNodeId: other.id })
  check("re-parenting works after soft-deleting the old parent link", true)

  await db.insert(schema.connections).values({
    boardId: board.id,
    fromNodeId: other.id,
    toNodeId: child.id,
    kind: "related",
    createdBy: "ai",
    status: "suggested",
  })
  check("cross-links are not limited by the one-parent rule", true)

  // Delete / restore history: delete, restore, delete again must leave three events in order.
  const [cycle] = await db
    .insert(schema.nodes)
    .values({ boardId: board.id, createdBy: "owner" })
    .returning()
  const byId = eq(schema.nodes.id, cycle.id)
  await db
    .update(schema.nodes)
    .set({ deletedAt: new Date(Date.now() - 2000) })
    .where(byId)
  await expectError(
    "an already-deleted node cannot be deleted again",
    () => db.update(schema.nodes).set({ deletedAt: new Date() }).where(byId),
    /already deleted/
  )
  await db.update(schema.nodes).set({ deletedAt: null }).where(byId)
  await db
    .update(schema.nodes)
    .set({ deletedAt: new Date(Date.now() + 1000) })
    .where(byId)
  // An update that doesn't touch deleted_at must not log anything.
  await db.update(schema.nodes).set({ type: "question" }).where(byId)

  const events = await db
    .select()
    .from(schema.deletionEvents)
    .where(eq(schema.deletionEvents.entityId, cycle.id))
    .orderBy(schema.deletionEvents.createdAt)
  check(
    "delete, restore, delete is logged as three events in order",
    events.map((e) => e.action).join(",") === "deleted,restored,deleted",
    events.map((e) => e.action).join(",")
  )
  check(
    "events carry the node type and real timestamps",
    events.every(
      (e) =>
        e.entityType === "node" && e.createdAt.getTime() > 1_700_000_000_000
    )
  )

  await db
    .update(schema.connections)
    .set({ deletedAt: null })
    .where(eq(schema.connections.id, firstParent.id))
    .then(
      () =>
        check(
          "restoring a link that would give a node two parents is rejected",
          false
        ),
      (error) =>
        check(
          "restoring a link that would give a node two parents is rejected",
          /UNIQUE/.test(String(error?.cause ?? error))
        )
    )

  await expectError(
    "deletion events cannot be updated",
    () => db.update(schema.deletionEvents).set({ action: "restored" }),
    /append-only/
  )
  await expectError(
    "deletion events cannot be deleted",
    () => db.delete(schema.deletionEvents),
    /append-only/
  )
  await expectError(
    "boards cannot be hard-deleted",
    () => db.delete(schema.boards).where(eq(schema.boards.id, board.id)),
    /soft-deleted/
  )

  await expectError(
    "foreign keys reject unknown nodes",
    () =>
      db
        .insert(schema.nodeVersions)
        .values({ nodeId: "does-not-exist", text: "x", author: "owner" }),
    /FOREIGN KEY/
  )
}

main()
  .catch((error) => {
    console.error(error)
    failures++
  })
  .finally(() => {
    client.close()
    try {
      rmSync(file, { force: true })
    } catch {
      // Windows can keep the file locked briefly; it lives in the OS temp folder.
    }
    console.log(
      failures ? `\n${failures} check(s) failed` : "\nall checks passed"
    )
    process.exit(failures ? 1 : 0)
  })
