import { pgTable, serial, text, boolean, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleNameEnum = pgEnum("role_name", [
  "safety_marshal",
  "medic",
  "de_escalator",
  "chant_lead",
  "information_services",
]);

export const attendeesTable = pgTable("attendees", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  preRegistered: boolean("pre_registered").notNull().default(false),
  mobilizeId: text("mobilize_id"),
  checkedInAt: timestamp("checked_in_at").notNull().defaultNow(),
});

export const attendeeRolesTable = pgTable("attendee_roles", {
  id: serial("id").primaryKey(),
  attendeeId: integer("attendee_id").notNull().references(() => attendeesTable.id),
  roleName: roleNameEnum("role_name").notNull(),
  isTrained: boolean("is_trained").notNull().default(false),
}, (table) => ({
  attendeeIdIdx: index("attendee_roles_attendee_id_idx").on(table.attendeeId),
}));

export const preRegistrationsTable = pgTable("pre_registrations", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  // Not unique — two people can share an email (couples, families).
  // When admin resolves a conflict as "accept both", a second record is inserted
  // with needsEmailUpdate=true so the second arrival is prompted to update at check-in.
  email: text("email").notNull(),
  phone: text("phone"),
  needsEmailUpdate: boolean("needs_email_update").notNull().default(false),
  sharedEmailWith: text("shared_email_with"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const volunteerPreRegistrationsTable = pgTable("volunteer_pre_registrations", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  roleName: text("role_name").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export type PreRegistration = typeof preRegistrationsTable.$inferSelect;
export type VolunteerPreRegistration = typeof volunteerPreRegistrationsTable.$inferSelect;

export const insertAttendeeSchema = createInsertSchema(attendeesTable).omit({ id: true, checkedInAt: true });
export const insertAttendeeRoleSchema = createInsertSchema(attendeeRolesTable).omit({ id: true });

export type InsertAttendee = z.infer<typeof insertAttendeeSchema>;
export type Attendee = typeof attendeesTable.$inferSelect;
export type InsertAttendeeRole = z.infer<typeof insertAttendeeRoleSchema>;
export type AttendeeRole = typeof attendeeRolesTable.$inferSelect;
