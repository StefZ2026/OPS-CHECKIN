# ICU Check-In

Event check-in platform for Indivisible Cherokee United.

## Project structure

```
artifacts/
  api-server/      Express API (TypeScript)
  checkin-app/     React + Vite frontend
  mockup-sandbox/  Component preview / design sandbox
lib/
  db/              Shared Drizzle schema and database pool
```

## Getting started

Install dependencies from the repo root:

```bash
pnpm install
```

Start all services (the Replit workflows handle this automatically):

```bash
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/checkin-app dev
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SUPERADMIN_USERNAME` | Yes | Username for the platform-admin login |
| `SUPERADMIN_PASSWORD` | Yes | Password for the platform-admin login |
| `NK3_ADMIN_PASSWORD` | No | Initial admin password for the **nk3** event (see below) |

### Configuring the event admin password for new deployments

On a fresh deployment the seeded `nk3` event has no `admin_password`, which
causes the event admin login endpoint to return `503 Admin auth is not
configured`.

Set the `NK3_ADMIN_PASSWORD` environment variable before the server starts and
the seed function will write that value into the database automatically:

```bash
NK3_ADMIN_PASSWORD=my-secret-password
```

**Important notes:**

- The password is applied **only when the database value is currently `null`**.
  If a password has already been set (e.g. via the platform-admin UI), the
  environment variable is ignored on subsequent restarts, so manual changes are
  never overwritten.
- If you need to *reset* a password that was previously set via the UI, update
  it through the platform-admin page or directly via SQL — the env var alone
  will not override an existing value.
- The password is stored in plain text in the `events` table, consistent with
  the existing schema design.

## Seed configuration

The seeded organisation, events, and volunteer roles are defined in
`artifacts/api-server/src/seed-config.ts`. The seed runs on every startup and
is fully idempotent:

- Event metadata (name, date, giveaway flag) is kept in sync with the config.
- Volunteer roles are upserted; roles removed from the config are deleted from
  the database.
- Attendee and check-in data are never affected.
