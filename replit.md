# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Applications

### ICU Check-In Platform (multi-event SaaS)
Tablet-optimized event check-in for ICU (Indivisible Cherokee United). Supports multiple events and organizations.
- **Frontend**: `artifacts/checkin-app` — React + Vite, served at `/`
- **Backend**: Express API at `artifacts/api-server`
- **DB**: `lib/db/src/schema/attendees.ts` — `organizations`, `events`, `event_roles`, `attendees`, `attendee_roles`, `pre_registrations`, `volunteer_pre_registrations`
- **Admin**: Visit `/admin` for the live attendee dashboard

#### Data Model
- `organizations` → top-level tenant (e.g. ICU)
- `events` → individual rallies/sessions under an org; each has `slug`, `adminPassword`, `mobilizeEventId`, `giveawayEnabled`, `smsWristbandEnabled`
- `attendees` → each row has optional `entryToken` (40-char hex, unique) + `entryTokenUsedDate` (ISO date string) for QR wristband re-entry
- `event_roles` → volunteer roles available per event (dynamic, replaces hardcoded enum)
- All data tables carry `event_id` FK for multi-tenancy

#### Event-Scoped API Routes (preferred for new events)
All routes are prefixed `/api/events/:eventSlug/`:
- `GET  /config` — public; returns event name, date, roles (drives frontend UI)
- `POST /admin/login` — returns SHA-256 token scoped to this event
- `GET  /attendees` — auth required; attendee list for this event
- `POST /check-in/lookup` — pre-reg lookup scoped to event
- `POST /check-in/submit` — check-in scoped to event
- `GET  /admin/export-xlsx` — XLSX with no-shows, scoped to event
- `GET  /admin/pre-registrations` — all pre-regs for this event
- `GET  /check-in/scan/:token` — gate scanner: verify QR wristband token, mark used for today
- Upload endpoints: `/admin/upload-registrations`, `/admin/upload-volunteers`

#### Legacy Routes (NK3 backwards-compat, event_id=1)
Original routes at `/api/check-in/*`, `/api/admin/*`, `/api/attendees` — still work with global `ADMIN_PASSWORD` env var.

#### Auth
- **New (event-scoped)**: token = SHA-256(event.adminPassword + `:icu-checkin-2026`)
- **Legacy (global)**: token = SHA-256(ADMIN_PASSWORD env var + `:icu-admin-2026`)

#### Current Events in DB
- `nk3` (id=1) — No Kings 3 rally, March 28 2026, password=`CherokeeBoo*2026`, mobilize=`901026`

#### Mobilize integration
- API key stored at org level (`organizations.mobilize_api_key`) or falls back to `MOBILIZE_API_KEY` env var
- Event ID stored at event level (`events.mobilize_event_id`) or falls back to `MOBILIZE_EVENT_ID` env var

#### Superadmin auth (separate from event-level admin)
- Superadmin login: `POST /api/superadmin/login` — verifies against `SUPERADMIN_PASSWORD` env var, returns token derived with salt `:icu-superadmin-2026`
- All `/api/superadmin/*` routes use `requireSuperadminAuth` (separate from `requireAdminAuth`)
- Frontend: `/superadmin` page calls `/api/superadmin/login`

#### Volunteer Roles Master List
All 19 roles stored in `ALL_ROLES` in `artifacts/checkin-app/src/pages/superadmin.tsx`.
When creating an event, organizers check which roles they want. NK3's 4 are pre-checked.
Organizers can also type a custom role not in the list — it gets added as free-form text.

Pre-built list: Safety Marshal, Medic, De-Escalator, Chant Lead, Info Services,
Registration, Greeter, Timekeeper, Facilitator, Canvasser, Phone Banker,
AV / Tech, Photographer / Videographer, Setup & Teardown, Childcare,
Interpreter / Translation, Accessibility Support, Social Media, Outreach Coordinator.

#### Security — RLS Status (PHASE 1 COMPLETE, PHASE 2 PENDING)

**Phase 1 — DONE (2026-04-17):**
- RLS enabled on all 7 tenant tables: `organizations`, `events`, `event_roles`,
  `attendees`, `attendee_roles`, `pre_registrations`, `volunteer_pre_registrations`
- Permissive `allow_all` policy (`USING (true)`) created on each table
- Effect: any non-owner DB user who somehow gets a connection cannot read any rows
- The app user (`postgres`, table owner) bypasses RLS by default — nothing broke

**Phase 2 — PENDING (do next session):**
Goal: enforce per-org tenant isolation even for the app user itself,
so a buggy query that forgets a `WHERE event_id = X` clause cannot leak Org A's
data to Org B's admin.

Implementation plan:
1. Add a DB middleware helper that sets `SET LOCAL app.current_org_id` and
   `SET LOCAL app.is_superadmin` at the start of every request's DB transaction
2. Replace `allow_all` policies with org-scoped policies:
   ```sql
   CREATE POLICY org_isolation ON attendees
     USING (
       current_setting('app.is_superadmin', true) = 'true'
       OR event_id IN (
         SELECT id FROM events
         WHERE org_id = current_setting('app.current_org_id', true)::integer
       )
     );
   ```
3. Apply `FORCE ROW LEVEL SECURITY` so the owner is also subject to policies
4. Wrap all route-level DB calls in transactions that set the context first
5. Files to modify: `artifacts/api-server/src/routes/events.ts`,
   `admin.ts`, `attendees.ts`, `checkin.ts`, `upload.ts` — each needs a
   `db.transaction` wrapper that starts with `SET LOCAL app.current_org_id = X`

Key constraint: `SET LOCAL` only lives within a transaction. Connection pool
connections that aren't in a transaction retain no session state between requests.

**Other security notes:**
- Rate limiting: 120 req/IP/10min on `/check-in/lookup` and `/check-in/submit` (both event-scoped and legacy routes)
- Admin login: 20 failed attempts/IP/15min rate limit
- Superadmin login: same rate limit, separate token
- CORS: fully open — intentional for a public check-in kiosk accessible from any device
- Event admin passwords: stored plaintext in `events.adminPassword` — acceptable
  for now (server-side only), revisit if this becomes a regulated-data app
- Helmet middleware: enabled

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (shared backend)
│   └── checkin-app/        # ICU check-in React + Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
