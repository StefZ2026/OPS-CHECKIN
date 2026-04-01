import app from "./app";
import { pool } from "@workspace/db";

// Safe idempotent migrations — run on every startup, safe to repeat
async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS attendees_email_unique ON attendees (email);
      CREATE INDEX IF NOT EXISTS attendee_roles_attendee_id_idx ON attendee_roles (attendee_id);
      CREATE INDEX IF NOT EXISTS pre_registrations_email_idx ON pre_registrations (email);
    `);
    // One-time fix: nobody at NK3 was ever asked about future contact — false was the
    // schema default, not an explicit answer. Flip all false → null (= "never asked").
    await client.query(`
      UPDATE attendees SET wants_to_be_contacted = NULL WHERE wants_to_be_contacted = false
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
