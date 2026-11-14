import { sql } from "drizzle-orm"

import { aiUsage } from "@/lib/db/schema"
import type { Db } from "@/lib/db/types"

/*
 * Daily cap on AI calls (SPEC.md 7.6, D16). Configure with AI_DAILY_CALL_CAP.
 */

export const DEFAULT_DAILY_CALL_CAP = 300

export function dailyCallCap(env = process.env) {
  const raw = Number(env.AI_DAILY_CALL_CAP)
  return Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : DEFAULT_DAILY_CALL_CAP
}

/** The UTC day key, e.g. "2026-11-14". */
export function usageDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

/**
 * Count one AI call against today's cap. Atomic: the increment only happens while
 * under the cap. Returns false (and counts nothing) once the cap is reached.
 */
export async function reserveAiCall(db: Db, cap: number, now = new Date()) {
  if (cap <= 0) return false
  const rows = await db
    .insert(aiUsage)
    .values({ day: usageDay(now), calls: 1 })
    .onConflictDoUpdate({
      target: aiUsage.day,
      set: { calls: sql`${aiUsage.calls} + 1` },
      setWhere: sql`${aiUsage.calls} < ${cap}`,
    })
    .returning({ calls: aiUsage.calls })
  return rows.length > 0
}

/** Calls used today. */
export async function callsToday(db: Db, now = new Date()) {
  const [row] = await db
    .select({ calls: aiUsage.calls })
    .from(aiUsage)
    .where(sql`${aiUsage.day} = ${usageDay(now)}`)
  return row?.calls ?? 0
}
