// ── Seed configuration ────────────────────────────────────────────────────────
// Edit this file to change what events and roles are seeded on startup.
// The seed is idempotent and safe to run repeatedly:
//   - Event fields (name, event_date, giveaway_enabled) are kept in sync with this file.
//   - Roles are upserted; roles removed from this file are deleted from the database.
//   - Existing attendee and check-in data is never affected.

export interface RoleConfig {
  roleKey: string;
  displayName: string;
  sortOrder: number;
}

export interface EventConfig {
  slug: string;
  name: string;
  eventDate: string;
  giveawayEnabled: boolean;
  roles: RoleConfig[];
  /**
   * Initial admin password for the event.  Set via the NK3_ADMIN_PASSWORD
   * environment variable.  Only applied to the database when the current
   * stored value is null, so a password changed through the UI is never
   * overwritten on restart.
   */
  adminPassword?: string;
}

export interface OrgConfig {
  slug: string;
  name: string;
  events: EventConfig[];
}

const seedConfig: OrgConfig = {
  slug: "icu",
  name: "Indivisible Cherokee United",
  events: [
    {
      slug: "nk3",
      name: "No Kings 3",
      eventDate: "2026-03-28",
      giveawayEnabled: true,
      // Read initial admin password from env; only applied when the DB value is null.
      adminPassword: process.env.NK3_ADMIN_PASSWORD || undefined,
      roles: [
        { roleKey: "safety_marshal",       displayName: "Safety Marshal", sortOrder: 1 },
        { roleKey: "medic",                displayName: "Medic",          sortOrder: 2 },
        { roleKey: "de_escalator",         displayName: "De-escalator",   sortOrder: 3 },
        { roleKey: "chant_lead",           displayName: "Chant Lead",     sortOrder: 4 },
        { roleKey: "information_services", displayName: "Info Services",  sortOrder: 5 },
      ],
    },
  ],
};

export default seedConfig;
