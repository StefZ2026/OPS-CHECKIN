// ── Database seed ─────────────────────────────────────────────────────────────
// Reads from seed-config.ts and inserts the org, events, and volunteer roles
// into the database if they don't already exist. Safe to call on every startup.

import { pool } from "@workspace/db";
import seedConfig from "./seed-config";

export async function runSeed(): Promise<void> {
  const client = await pool.connect();
  try {
    const org = seedConfig;

    // Ensure the organization exists
    await client.query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [org.name, org.slug],
    );

    for (const event of org.events) {
      // Ensure the event exists under this org
      await client.query(
        `INSERT INTO events (org_id, name, slug, event_date, giveaway_enabled, is_active)
         SELECT o.id, $1, $2, $3::date, $4, true
         FROM organizations o
         WHERE o.slug = $5
         ON CONFLICT (slug) DO NOTHING`,
        [event.name, event.slug, event.eventDate, event.giveawayEnabled, org.slug],
      );

      // Ensure each volunteer role exists for this event
      for (const role of event.roles) {
        await client.query(
          `INSERT INTO event_roles (event_id, role_key, display_name, sort_order)
           SELECT e.id, $1, $2, $3
           FROM events e
           WHERE e.slug = $4
           ON CONFLICT DO NOTHING`,
          [role.roleKey, role.displayName, role.sortOrder, event.slug],
        );
      }
    }

    console.log("Seed OK — org, events, and roles are present.");
  } finally {
    client.release();
  }
}
