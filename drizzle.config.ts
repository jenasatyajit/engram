import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// Next.js loads .env.local for the app; drizzle-kit needs it loaded explicitly.
config({ path: ".env.local", quiet: true })

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
  strict: true,
  verbose: true,
})
