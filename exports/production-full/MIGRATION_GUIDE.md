# OpsCheckIn Full Migration Guide

## What's In This Backup

### Code
- `workspace/` — Full application source code (minus node_modules)
  - `artifacts/api-server/` — Express API backend
  - `artifacts/checkin-app/` — React/Vite frontend
  - `lib/db/` — Drizzle ORM schema and database config

### Data (CSV exports — 2 copies, identical content)
- `supabase-direct/` — Exported directly via psql from Supabase
- `replit-dev/` — Exported via the app's own database connection
  - `organizations.csv` — 1 org
  - `events.csv` — 1 event (NK3)
  - `event_roles.csv` — volunteer role definitions
  - `attendees.csv` — 230 attendees
  - `attendee_roles.csv` — 61 role assignments
  - `pre_registrations.csv` — 476 pre-registrations
  - `volunteer_pre_registrations.csv` — 50 volunteer pre-registrations

---

## Database Connection
- **Provider:** Supabase (PostgreSQL 17)
- **Connection string (pooler):** stored as `PG_POOLER_URL` in Replit environment
- **Host:** aws-1-us-east-2.pooler.supabase.com:6543
- **Database:** postgres

---

## How to Migrate to a New Replit Project

### Step 1 — Create a new Replit project
- Choose "Import from GitHub" or create a blank PNPM workspace
- Extract this backup into the new project

### Step 2 — Install dependencies
```bash
pnpm install
```

### Step 3 — Set environment variables
In the new project's Secrets or env vars, set:
```
PG_POOLER_URL=postgresql://postgres.wpgzoanaxmfhiqfoohay:SylviBoo*2026@aws-1-us-east-2.pooler.supabase.com:6543/postgres
JWT_SECRET=7d5df38297d028fa0918bed09298bfb53b5159bf682d2180b040dd76a2454c456afb0fa264465841a5a1d1b3cf2d308e
ADMIN_USERNAME=SAZOPSCHECKIN08
ADMIN_PASSWORD=SylviBoo*2026
TELNYX_API_KEY=(from original secrets)
TELNYX_FROM_NUMBER=(from original secrets)
SUPERADMIN_USERNAME=(from original secrets)
```

### Step 4 — The database already has all data
The Supabase database is external — it is NOT inside Replit. Your 230 attendees and all data are already there. No import needed.

### Step 5 — Run the app
```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/checkin-app run dev
```

### Step 6 — Publish
The new project will have a fresh Replit database (no broken helium). Publish normally.

### Step 7 — Point opscheckin.com to new deployment
In your domain registrar (wherever opscheckin.com DNS is managed):
- Update the CNAME or A record to point to the new Replit deployment URL
- This takes 1–48 hours to propagate

---

## How to Migrate to a Different Host (e.g. Railway, Render, Fly.io)

### Backend (API server)
```bash
pnpm --filter @workspace/api-server run build
# Output: artifacts/api-server/dist/index.cjs
# Run with: node artifacts/api-server/dist/index.cjs
# Requires: PORT, PG_POOLER_URL, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
```

### Frontend (checkin-app)
```bash
pnpm --filter @workspace/checkin-app run build
# Output: artifacts/checkin-app/dist/public/
# Serve as static files — any static host works (Netlify, Vercel, Cloudflare Pages)
```

### Database
No migration needed — Supabase is already cloud-hosted and accessible from anywhere.

---

## Current Status (as of backup)
- Production site: opscheckin.com (running old pre-rollback code)
- Dev/Supabase: All NK3 data migrated and ready
- Publish blocked: Replit helium database DNS broken for this project
