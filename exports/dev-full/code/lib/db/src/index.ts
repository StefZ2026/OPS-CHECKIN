import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.PG_POOLER_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string found. Set SUPABASE_DATABASE_URL or DATABASE_URL.",
  );
}

export const pool = new Pool({ connectionString, max: 20 });
export const db = drizzle(pool, { schema });

export * from "./schema";
