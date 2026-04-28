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
