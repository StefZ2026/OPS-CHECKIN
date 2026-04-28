// ── Database seed ─────────────────────────────────────────────────────────────
// Reads from seed-config.ts and inserts the org, events, and volunteer roles
// into the database if they don't already exist. Safe to call on every startup.
// Event fields (name, event_date, giveaway_enabled) and role lists are kept in
// sync with the config on every startup — existing attendee/check-in data is
// never affected.
//
// Also seeds a platform admin user if PLATFORM_ADMIN_EMAIL and
// PLATFORM_ADMIN_PASSWORD env vars are set and no superadmin exists yet.

import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";
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
      // Upsert the event — update mutable fields if the slug already exists.
      // admin_password is set only when the current stored value is null so
      // that a password changed via the UI is never overwritten on restart.
      await client.query(
        `INSERT INTO events (org_id, name, slug, event_date, giveaway_enabled, is_active, admin_password)
         SELECT o.id, $1, $2, $3::date, $4, true, $6
         FROM organizations o
         WHERE o.slug = $5
         ON CONFLICT (slug) DO UPDATE
           SET name             = EXCLUDED.name,
               event_date       = EXCLUDED.event_date,
               giveaway_enabled = EXCLUDED.giveaway_enabled,
               admin_password   = COALESCE(events.admin_password, EXCLUDED.admin_password)`,
        [event.name, event.slug, event.eventDate, event.giveawayEnabled, org.slug, event.adminPassword ?? null],
      );

      // Upsert each volunteer role (insert new rows, update display_name/sort_order on existing ones)
      for (const role of event.roles) {
        await client.query(
          `INSERT INTO event_roles (event_id, role_key, display_name, sort_order)
           SELECT e.id, $1, $2, $3
           FROM events e
           WHERE e.slug = $4
           ON CONFLICT (event_id, role_key) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 sort_order   = EXCLUDED.sort_order`,
          [role.roleKey, role.displayName, role.sortOrder, event.slug],
        );
      }

      // Remove roles that are no longer in the config.
      // attendee_roles stores role names as plain text so this never deletes attendee data.
      const configRoleKeys = event.roles.map((r) => r.roleKey);
      await client.query(
        `DELETE FROM event_roles er
         USING events e
         WHERE er.event_id = e.id
           AND e.slug = $1
           AND er.role_key <> ALL($2::text[])`,
        [event.slug, configRoleKeys],
      );
    }

    // ── Platform admin seeding ─────────────────────────────────────────────────
    // Always upsert the platform admin account so password changes take effect
    // on next server restart without touching the DB manually.
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
    if (adminEmail && adminPassword) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await client.query(
        `INSERT INTO users (name, email, role, password_hash, password_set, org_id, event_id)
         VALUES ('Platform Admin', $1, 'superadmin', $2, true, NULL, NULL)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, password_set = true, role = 'superadmin'`,
        [adminEmail, passwordHash],
      );
      console.log(`Seed: platform admin upserted for ${adminEmail}`);
    }

    console.log("Seed OK — org, events, and roles are up to date.");
  } finally {
    client.release();
  }
}
