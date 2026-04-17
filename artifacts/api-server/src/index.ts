import app from "./app";
import { pool } from "@workspace/db";

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

    // ── Multi-event seed (idempotent) ──────────────────────────────────────────
    // Ensure ICU org exists
    await client.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('ICU - Indivisible Caucus United', 'icu')
      ON CONFLICT (slug) DO NOTHING
    `);

    // Ensure NK3 event exists under ICU
    await client.query(`
      INSERT INTO events (org_id, name, slug, event_date, giveaway_enabled, is_active)
      SELECT o.id, 'No Kings 3', 'nk3', '2026-03-28', true, true
      FROM organizations o WHERE o.slug = 'icu'
      ON CONFLICT (slug) DO NOTHING
    `);

    // Seed NK3 volunteer roles (safe: unique index on event_id + role_key prevents duplicates)
    await client.query(`
      INSERT INTO event_roles (event_id, role_key, display_name, sort_order)
      SELECT e.id, v.role_key, v.display_name, v.sort_order
      FROM events e,
        (VALUES
          ('safety_marshal',       'Safety Marshal', 1),
          ('medic',                'Medic',          2),
          ('de_escalator',         'De-escalator',   3),
          ('chant_lead',           'Chant Lead',     4),
          ('information_services', 'Info Services',  5)
        ) AS v(role_key, display_name, sort_order)
      WHERE e.slug = 'nk3'
      ON CONFLICT DO NOTHING
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

runStartupMigrations().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
