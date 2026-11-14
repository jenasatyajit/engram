import type { LibSQLDatabase } from "drizzle-orm/libsql"

import type * as schema from "./schema"

/** Database handle type. Domain functions take this so tests can pass a local database. */
export type Db = LibSQLDatabase<typeof schema>
