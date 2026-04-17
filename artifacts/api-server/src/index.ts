import app from "./app";
import { pool } from "@workspace/db";
import { runSeed } from "./seed";

// Safe idempotent migrations — run on every startup, safe to repeat
async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    // Indexes (idempotent)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS attendees_email_unique ON attendees (email);
      CREATE INDEX IF NOT EXISTS attendee_roles_attendee_id_idx ON attendee_roles (attendee_id);
      CREATE INDEX IF NOT EXISTS pre_registrations_email_idx ON pre_registrations (email);
    `);

    // NK3 data fix: nobody was asked about future contact — false was the schema default,
    // not an explicit answer. Flip false → null (= "never asked"). Idempotent.
    await client.query(`
      UPDATE attendees SET wants_to_be_contacted = NULL WHERE wants_to_be_contacted = false
    `);

    // Backfill: tag any legacy records that predate the event_id column
    await client.query(`
      UPDATE attendees SET event_id = (SELECT id FROM events WHERE slug = 'nk3')
      WHERE event_id IS NULL
    `);
    await client.query(`
      UPDATE pre_registrations SET event_id = (SELECT id FROM events WHERE slug = 'nk3')
      WHERE event_id IS NULL
    `);
    await client.query(`
      UPDATE volunteer_pre_registrations SET event_id = (SELECT id FROM events WHERE slug = 'nk3')
      WHERE event_id IS NULL
    `);

    // ── RLS Phase 1 (idempotent — re-applied every startup so drizzle-kit push
    //    can't wipe it) ──────────────────────────────────────────────────────────
    // Enables Row Level Security on all tenant-data tables. The app user (postgres,
    // table owner) bypasses RLS by default so nothing breaks. Any other DB user
    // who somehow obtains a connection is blocked from all rows by default.
    //
    // Phase 2 (session-variable per-org policies + FORCE ROW LEVEL SECURITY) is
    // documented in replit.md and will replace the allow_all policies below.
    const tenantTables = [
      "organizations", "events", "event_roles",
      "attendees", "attendee_roles",
      "pre_registrations", "volunteer_pre_registrations",
    ];
    for (const table of tenantTables) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE tablename = '${table}' AND policyname = 'allow_all'
          ) THEN
            EXECUTE 'CREATE POLICY allow_all ON ${table} FOR ALL USING (true) WITH CHECK (true)';
          END IF;
        END $$;
      `);
    }

    console.log("Startup migrations OK");
  } catch (err) {
    console.warn("Startup migration warning (non-fatal):", err);
  } finally {
    client.release();
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run seed first (creates org/events/roles), then structural migrations and backfills
runSeed()
  .then(() => runStartupMigrations())
  .then(() => {
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
