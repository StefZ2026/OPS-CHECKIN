import { pgTable, serial, text, boolean, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Organizations ─────────────────────────────────────────────────────────────
// Top-level tenant. One org can run many events (e.g. ICU runs NK3 + Building Bridges series).

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Stored at org level — one key covers all their events
  mobilizeApiKey: text("mobilize_api_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Events ────────────────────────────────────────────────────────────────────
// Each rally, cafe session, or other gathering is one event under an org.

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  eventDate: timestamp("event_date"),
  giveawayEnabled: boolean("giveaway_enabled").notNull().default(false),
  // Which Mobilize event to query for pre-reg lookup (null = no Mobilize, use CSV only)
  mobilizeEventId: text("mobilize_event_id"),
  // Plain password for the event's admin — scoped token is derived from this at login time
  adminPassword: text("admin_password"),
  isActive: boolean("is_active").notNull().default(true),
  // When true: day-1 check-in sends an SMS with a QR code link for re-entry on subsequent days
  smsReentryEnabled: boolean("sms_reentry_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Event Volunteer Roles ─────────────────────────────────────────────────────
// Defines which volunteer roles are available for check-in at a given event.
// Replaces the hardcoded enum — each event can have completely different roles.

export const eventRolesTable = pgTable("event_roles", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id),
  roleKey: text("role_key").notNull(),       // internal key, e.g. "safety_marshal"
  displayName: text("display_name").notNull(), // shown in UI, e.g. "Safety Marshal"
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => ({
  eventIdIdx: index("event_roles_event_id_idx").on(table.eventId),
  uniqueEventRole: uniqueIndex("event_roles_event_id_role_key_idx").on(table.eventId, table.roleKey),
}));

// ── Attendees ─────────────────────────────────────────────────────────────────
// eventId is nullable to allow safe migration — the startup migration tags all
// existing records with event_id=1 (NK3). After migration all rows will have a value.
// email uniqueness is scoped per event so the same person can attend multiple events.

export const attendeesTable = pgTable("attendees", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  preRegistered: boolean("pre_registered").notNull().default(false),
  mobilizeId: text("mobilize_id"),
  checkedInAt: timestamp("checked_in_at").notNull().defaultNow(),
  isNoIceWinner: boolean("is_no_ice_winner").notNull().default(false),
  // null = never asked; true = yes; false = explicitly declined
  wantsToBeContacted: boolean("wants_to_be_contacted"),
  // QR wristband re-entry token (set after day-1 check-in at consecutive-day events)
  entryToken: text("entry_token").unique(),
  // ISO date "YYYY-MM-DD" of the most recent day this token was scanned for entry
  entryTokenUsedDate: text("entry_token_used_date"),
}, (table) => ({
  eventEmailUnique: uniqueIndex("attendees_event_id_email_idx").on(table.eventId, table.email),
}));

// ── Attendee Roles ────────────────────────────────────────────────────────────
// roleName changed from pgEnum to plain text so any event can use any role names.
// Existing NK3 values (safety_marshal, medic, etc.) are valid text strings — no data loss.

export const attendeeRolesTable = pgTable("attendee_roles", {
  id: serial("id").primaryKey(),
  attendeeId: integer("attendee_id").notNull().references(() => attendeesTable.id),
  roleName: text("role_name").notNull(),
  isTrained: boolean("is_trained").notNull().default(false),
  hasServed: boolean("has_served").notNull().default(false),
  // null = pre-reg volunteer (no explicit ask); true = serving today; false = has experience but declined
  wantsToServeToday: boolean("wants_to_serve_today"),
}, (table) => ({
  attendeeIdIdx: index("attendee_roles_attendee_id_idx").on(table.attendeeId),
}));

// ── Pre-Registrations ─────────────────────────────────────────────────────────
// eventId nullable for safe migration — backfilled to NK3 on startup.

export const preRegistrationsTable = pgTable("pre_registrations", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  needsEmailUpdate: boolean("needs_email_update").notNull().default(false),
  sharedEmailWith: text("shared_email_with"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// ── Volunteer Pre-Registrations ───────────────────────────────────────────────
// eventId nullable for safe migration — backfilled to NK3 on startup.

export const volunteerPreRegistrationsTable = pgTable("volunteer_pre_registrations", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => eventsTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  roleName: text("role_name").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// ── Types & Insert Schemas ────────────────────────────────────────────────────

export type Organization = typeof organizationsTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
export type EventRole = typeof eventRolesTable.$inferSelect;
export type PreRegistration = typeof preRegistrationsTable.$inferSelect;
export type VolunteerPreRegistration = typeof volunteerPreRegistrationsTable.$inferSelect;

export const insertAttendeeSchema = createInsertSchema(attendeesTable).omit({ id: true, checkedInAt: true });
export const insertAttendeeRoleSchema = createInsertSchema(attendeeRolesTable).omit({ id: true });

export type InsertAttendee = z.infer<typeof insertAttendeeSchema>;
export type Attendee = typeof attendeesTable.$inferSelect;
export type InsertAttendeeRole = z.infer<typeof insertAttendeeRoleSchema>;
export type AttendeeRole = typeof attendeeRolesTable.$inferSelect;
