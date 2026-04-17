// ── Seed configuration ────────────────────────────────────────────────────────
// Edit this file to change what events and roles are created in a fresh database.
// The seed is idempotent — existing rows are never overwritten or duplicated.

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
  name: "ICU - Indivisible Caucus United",
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
    {
      slug: "bb-cafe-1",
      name: "Building Bridges Cafe Series — Session 1",
      eventDate: "2026-05-10",
      giveawayEnabled: false,
      roles: [
        { roleKey: "safety_marshal",       displayName: "Safety Marshal", sortOrder: 1 },
        { roleKey: "de_escalator",         displayName: "De-escalator",   sortOrder: 2 },
        { roleKey: "information_services", displayName: "Info Services",  sortOrder: 3 },
      ],
    },
  ],
};

export default seedConfig;
