import { defineConfig } from "drizzle-kit";
import path from "path";

const url = process.env.PG_POOLER_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error("No database URL found. Set PG_POOLER_URL, SUPABASE_DATABASE_URL, or DATABASE_URL.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
