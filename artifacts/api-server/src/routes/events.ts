import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { sendSms } from "../lib/sms";
import * as XLSX from "xlsx";
import { verifyToken } from "./auth";
import { db } from "@workspace/db";
import {
  eventsTable, eventRolesTable, organizationsTable,
  attendeesTable, attendeeRolesTable,
  preRegistrationsTable, volunteerPreRegistrationsTable,
} from "@workspace/db/schema";
import { eq, and, or, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { LookupAttendeeBody, SubmitCheckInBody } from "@workspace/api-zod";
import type { Event } from "@workspace/db/schema";

// ── Router ────────────────────────────────────────────────────────────────────
// mergeParams: true so we can read :eventSlug set by the parent router
const router: IRouter = Router({ mergeParams: true });

// ── Extend express.Locals so TypeScript knows what we attach ──────────────────
declare global {
  namespace Express {
    interface Locals {
      event: Event;
      orgMobilizeApiKey?: string | null;
    }
  }
}

// ── Event resolver middleware ──────────────────────────────────────────────────
// Runs before every route in this router. Resolves the event by slug and attaches
// it (plus the org's Mobilize API key) to res.locals.
router.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { eventSlug } = req.params as { eventSlug: string };
  try {
    const rows = await db
      .select({ event: eventsTable, mobilizeApiKey: organizationsTable.mobilizeApiKey })
      .from(eventsTable)
      .leftJoin(organizationsTable, eq(eventsTable.orgId, organizationsTable.id))
      .where(eq(eventsTable.slug, eventSlug))
      .limit(1);

    if (!rows[0]) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    // Inactive events block public check-in routes, but allow:
    // - /admin/* (event managers need full access to attendee data/exports)
    // - /config (admin UI fetches this to display event name/status)
    const isAdminOrConfig = req.path.startsWith("/admin") || req.path === "/config";
    if (!rows[0].event.isActive && !isAdminOrConfig) {
      res.status(403).json({ ok: false, state: "NOT_COVERED", error: "This event has ended — re-entry is no longer permitted." });
      return;
    }
    // For multi-day events: today must be one of the scheduled event dates.
    // Single-day events (eventDates null) rely solely on isActive above.
    if (!isAdminOrConfig && rows[0].event.eventDates) {
      const todayISO = new Date().toISOString().slice(0, 10);
      let validDates: string[] = [];
      try { validDates = JSON.parse(rows[0].event.eventDates as string) as string[]; } catch { /* ignore */ }
      if (validDates.length > 0 && !validDates.includes(todayISO)) {
        res.status(403).json({ ok: false, state: "NOT_COVERED", error: "Check-in is not open today. Please come back on an event day." });
        return;
      }
    }
    res.locals.event = rows[0].event;
    res.locals.orgMobilizeApiKey = rows[0].mobilizeApiKey;
    next();
  } catch (err) {
    console.error("Event resolver error:", err);
    res.status(500).json({ error: "Failed to resolve event" });
  }
});

// ── Auth helpers ──────────────────────────────────────────────────────────────
// JWT-only event auth: accepts superadmin (any event), org_contact (their org's
// events), or event_manager (their assigned event).
function requireEventAuth(req: Request, res: Response, next: NextFunction): void {
  const jwtToken = req.cookies?.auth_token as string | undefined;
  if (!jwtToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const payload = verifyToken(jwtToken);
  if (!payload) {
    res.status(401).json({ error: "Session expired" });
    return;
  }
  if (payload.role === "superadmin") {
    res.locals.authUser = payload;
    next();
    return;
  }
  const event = res.locals.event;
  if (payload.role === "org_contact" && event && payload.orgId === event.orgId) {
    res.locals.authUser = payload;
    next();
    return;
  }
  if (payload.role === "event_manager" && event && payload.eventId === event.id) {
    res.locals.authUser = payload;
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
}

// 120 check-in attempts per IP per 10 minutes (covers a whole event day at kiosks
// while still blocking bots that hit hundreds of times per minute)
const checkinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again in a few minutes." },
});

// ── Config (public) ───────────────────────────────────────────────────────────
// Returns event metadata + available volunteer roles for this event.
// The frontend uses this to configure the check-in UI without hardcoded data.

router.get("/config", async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const roles = await db
      .select()
      .from(eventRolesTable)
      .where(eq(eventRolesTable.eventId, event.id))
      .orderBy(eventRolesTable.sortOrder);

    res.json({
      id: event.id,
      name: event.name,
      slug: event.slug,
      eventDate: event.eventDate,
      giveawayEnabled: event.giveawayEnabled,
      isActive: event.isActive,
      roles: roles.map((r) => ({
        key: r.roleKey,
        displayName: r.displayName,
        sortOrder: r.sortOrder,
      })),
    });
  } catch (err) {
    console.error("GET /config error:", err);
    res.status(500).json({ error: "Failed to load event config" });
  }
});

// ── Pre-registrations (admin) ─────────────────────────────────────────────────

router.get("/admin/pre-registrations", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const [preRegs, volRegs] = await Promise.all([
      db.select().from(preRegistrationsTable).where(eq(preRegistrationsTable.eventId, event.id)),
      db.select().from(volunteerPreRegistrationsTable).where(eq(volunteerPreRegistrationsTable.eventId, event.id)),
    ]);

    const attendeeList = preRegs.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone ?? null,
      source: "attendee" as const,
      roleName: null,
    }));

    const volunteerList = volRegs.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email ?? null,
      phone: r.phone ?? null,
      source: "volunteer" as const,
      roleName: r.roleName,
    }));

    res.json({ preRegistrations: [...attendeeList, ...volunteerList] });
  } catch (err) {
    console.error("GET /admin/pre-registrations error:", err);
    res.status(500).json({ error: "Failed to load pre-registrations" });
  }
});

// ── XLSX export (admin) ───────────────────────────────────────────────────────

type ExportRow = {
  "Status": string; "First Name": string; "Last Name": string; "Email": string;
  "Phone": string; "Attended As": string; "Type": string;
  "Roles Served": string; "Roles Trained": string; "Prior Roles Served": string;
  "Checked In At": string; "Future Volunteer?": string;
};

async function buildEventExportRows(eventId: number): Promise<ExportRow[]> {
  const [attendees, roles, preRegs, volRegs] = await Promise.all([
    db.select().from(attendeesTable).where(eq(attendeesTable.eventId, eventId)).orderBy(attendeesTable.checkedInAt),
    db.select().from(attendeeRolesTable).where(
      inArray(attendeeRolesTable.attendeeId,
        db.select({ id: attendeesTable.id }).from(attendeesTable).where(eq(attendeesTable.eventId, eventId))
      )
    ),
    db.select().from(preRegistrationsTable).where(eq(preRegistrationsTable.eventId, eventId)),
    db.select().from(volunteerPreRegistrationsTable).where(eq(volunteerPreRegistrationsTable.eventId, eventId)),
  ]);

  const rolesMap = new Map<number, typeof roles>();
  for (const role of roles) {
    if (!rolesMap.has(role.attendeeId)) rolesMap.set(role.attendeeId, []);
    rolesMap.get(role.attendeeId)!.push(role);
  }

  const attendeesByEmail = new Map(attendees.map((a) => [a.email.toLowerCase(), a]));
  const coveredEmails = new Set<string>();
  const coveredByName = new Set<string>();
  const rows: ExportRow[] = [];

  const toRow = (a: (typeof attendees)[0], status: string): ExportRow => {
    const aRoles = rolesMap.get(a.id) ?? [];
    const isVolunteer = aRoles.some((r) => r.wantsToServeToday !== false);
    return {
      "Status": status,
      "First Name": a.firstName,
      "Last Name": a.lastName,
      "Email": a.email,
      "Phone": a.phone ?? "",
      "Attended As": isVolunteer ? "Volunteer" : "Attendee",
      "Type": a.preRegistered ? "Pre-Registered" : "Walk-in",
      "Roles Served": aRoles.filter((r) => r.wantsToServeToday !== false).map((r) => r.roleName.replace(/_/g, " ")).join("; "),
      "Roles Trained": aRoles.filter((r) => r.isTrained).map((r) => r.roleName.replace(/_/g, " ")).join("; "),
      "Prior Roles Served": aRoles.filter((r) => r.hasServed).map((r) => r.roleName.replace(/_/g, " ")).join("; "),
      "Checked In At": a.checkedInAt.toISOString(),
      "Future Volunteer?": a.wantsToBeContacted === true ? "Yes" : a.wantsToBeContacted === false ? "No" : "Unknown",
    };
  };

  const notCheckedIn = (p: {
    firstName: string; lastName: string; email: string; phone: string | null; type: string; role?: string;
  }): ExportRow => ({
    "Status": "Not Checked In",
    "First Name": p.firstName, "Last Name": p.lastName,
    "Email": p.email, "Phone": p.phone ?? "",
    "Attended As": "", "Type": p.type,
    "Roles Served": p.role ?? "", "Roles Trained": "", "Prior Roles Served": "",
    "Checked In At": "", "Future Volunteer?": "",
  });

  for (const pr of preRegs) {
    const email = pr.email.toLowerCase();
    const attendee = attendeesByEmail.get(email);
    if (attendee) {
      coveredEmails.add(email);
      rows.push(toRow(attendee, "Checked In"));
    } else {
      rows.push(notCheckedIn({ firstName: pr.firstName, lastName: pr.lastName, email: pr.email, phone: pr.phone, type: "Pre-Registered" }));
    }
  }

  for (const vr of volRegs) {
    const email = (vr.email ?? "").toLowerCase();
    const nameKey = `${vr.firstName.toLowerCase()} ${vr.lastName.toLowerCase()}`;
    if (email && attendeesByEmail.has(email) && !coveredEmails.has(email)) {
      const a = attendeesByEmail.get(email)!;
      coveredEmails.add(email);
      rows.push(toRow(a, "Checked In"));
    } else if (!email) {
      const nameMatch = attendees.find(
        (a) => a.firstName.toLowerCase() === vr.firstName.toLowerCase() && a.lastName.toLowerCase() === vr.lastName.toLowerCase()
      );
      if (nameMatch && !coveredEmails.has(nameMatch.email) && !coveredByName.has(nameKey)) {
        coveredEmails.add(nameMatch.email);
        coveredByName.add(nameKey);
        rows.push(toRow(nameMatch, "Checked In"));
      } else if (!nameMatch && !coveredByName.has(nameKey)) {
        coveredByName.add(nameKey);
        rows.push(notCheckedIn({ firstName: vr.firstName, lastName: vr.lastName, email: vr.email ?? "", phone: vr.phone, type: "Pre-Registered (Volunteer)", role: vr.roleName.replace(/_/g, " ") }));
      }
    }
  }

  for (const a of attendees) {
    if (!coveredEmails.has(a.email.toLowerCase())) rows.push(toRow(a, "Walk-in"));
  }

  return rows;
}

router.get("/admin/export-xlsx", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const exportRows = await buildEventExportRows(event.id);
    const ws = XLSX.utils.json_to_sheet(exportRows, {
      header: ["Status", "First Name", "Last Name", "Email", "Phone", "Attended As", "Type", "Roles Served", "Roles Trained", "Prior Roles Served", "Checked In At", "Future Volunteer?"],
    });
    ws["!cols"] = [
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 32 }, { wch: 16 },
      { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 22 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Full Roster");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${event.slug}-full-${dateStr}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error("GET /admin/export-xlsx error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

// ── Delete attendees (admin) ──────────────────────────────────────────────────

router.delete("/admin/attendees", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const { emails } = req.body as { emails?: string[] };
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: "Provide an array of emails to delete." });
    return;
  }
  try {
    const event = res.locals.event;
    const normalised = emails.map((e: string) => e.toLowerCase().trim());
    const toDelete = await db
      .select({ id: attendeesTable.id, email: attendeesTable.email })
      .from(attendeesTable)
      .where(and(inArray(attendeesTable.email, normalised), eq(attendeesTable.eventId, event.id)));

    if (toDelete.length === 0) {
      res.json({ deleted: 0, message: "No matching records found." });
      return;
    }
    const ids = toDelete.map((a) => a.id);
    await db.delete(attendeeRolesTable).where(inArray(attendeeRolesTable.attendeeId, ids));
    await db.delete(attendeesTable).where(inArray(attendeesTable.id, ids));
    res.json({ deleted: toDelete.length, emails: toDelete.map((a) => a.email) });
  } catch (err) {
    console.error("DELETE /admin/attendees error:", err);
    res.status(500).json({ error: "Failed to delete attendees" });
  }
});

// ── Attendees list (admin) ────────────────────────────────────────────────────

router.get("/attendees", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const attendees = await db
      .select()
      .from(attendeesTable)
      .where(eq(attendeesTable.eventId, event.id))
      .orderBy(attendeesTable.checkedInAt);

    const allRoles = await db
      .select()
      .from(attendeeRolesTable)
      .where(
        inArray(attendeeRolesTable.attendeeId,
          db.select({ id: attendeesTable.id }).from(attendeesTable).where(eq(attendeesTable.eventId, event.id))
        )
      );

    const rolesMap = new Map<number, typeof allRoles>();
    for (const role of allRoles) {
      if (!rolesMap.has(role.attendeeId)) rolesMap.set(role.attendeeId, []);
      rolesMap.get(role.attendeeId)!.push(role);
    }

    const total = attendees.length;
    const preRegisteredCount = attendees.filter((a) => a.preRegistered).length;
    const walkInCount = total - preRegisteredCount;

    const result = attendees.map((a) => ({
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone ?? null,
      preRegistered: a.preRegistered,
      mobilizeId: a.mobilizeId ?? null,
      checkedInAt: a.checkedInAt.toISOString(),
      isNoIceWinner: a.isNoIceWinner,
      wantsToBeContacted: a.wantsToBeContacted,
      roles: (rolesMap.get(a.id) ?? []).map((r) => ({
        id: r.id,
        roleName: r.roleName,
        isTrained: r.isTrained,
        hasServed: r.hasServed,
        wantsToServeToday: r.wantsToServeToday ?? null,
      })),
    }));

    res.json({ total, preRegisteredCount, walkInCount, attendees: result });
  } catch (err) {
    console.error("GET /attendees error:", err);
    res.status(500).json({ error: "Failed to load attendees" });
  }
});

// ── Edit attendee / roles (admin) ─────────────────────────────────────────────

const VALID_ROLE_NAMES = ["safety_marshal", "medic", "de_escalator", "chant_lead", "information_services"] as const;
type RoleName = typeof VALID_ROLE_NAMES[number];
function isValidRoleName(name: unknown): name is RoleName {
  return typeof name === "string" && (VALID_ROLE_NAMES as readonly string[]).includes(name);
}

router.patch("/admin/attendees/:id", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { firstName, lastName, phone, preRegistered, email } = req.body as { firstName?: string; lastName?: string; phone?: string; preRegistered?: boolean; email?: string };
  const updates: Record<string, string | boolean | null> = {};
  if (firstName !== undefined) updates.firstName = firstName.trim();
  if (lastName !== undefined) updates.lastName = lastName.trim();
  if (phone !== undefined) updates.phone = phone.replace(/\D/g, "") || null;
  if (preRegistered !== undefined) updates.preRegistered = preRegistered;
  if (email !== undefined && email.trim()) updates.email = email.trim().toLowerCase();
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  try {
    const event = res.locals.event;
    await db.update(attendeesTable).set(updates).where(and(eq(attendeesTable.id, id), eq(attendeesTable.eventId, event.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /admin/attendees/:id error:", err);
    res.status(500).json({ error: "Failed to update attendee" });
  }
});

router.put("/admin/attendee-roles/:roleId", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) { res.status(400).json({ error: "Invalid roleId" }); return; }
  const { roleName, wantsToServeToday, isTrained, hasServed } = req.body as { roleName?: string; wantsToServeToday?: boolean | null; isTrained?: boolean; hasServed?: boolean };
  const updates: Record<string, unknown> = {};
  if (roleName !== undefined) {
    if (!isValidRoleName(roleName)) { res.status(400).json({ error: "Invalid roleName" }); return; }
    updates.roleName = roleName;
  }
  if (wantsToServeToday !== undefined) updates.wantsToServeToday = wantsToServeToday;
  if (typeof isTrained === "boolean") updates.isTrained = isTrained;
  if (typeof hasServed === "boolean") updates.hasServed = hasServed;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  try {
    await db.update(attendeeRolesTable).set(updates).where(eq(attendeeRolesTable.id, roleId));
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /admin/attendee-roles/:roleId error:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.delete("/admin/attendee-roles/:roleId", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) { res.status(400).json({ error: "Invalid roleId" }); return; }
  try {
    await db.delete(attendeeRolesTable).where(eq(attendeeRolesTable.id, roleId));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/attendee-roles/:roleId error:", err);
    res.status(500).json({ error: "Failed to delete role" });
  }
});

router.post("/admin/attendees/:id/roles", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid attendee id" }); return; }
  const { roleName, wantsToServeToday, isTrained, hasServed } = req.body as { roleName?: string; wantsToServeToday?: boolean | null; isTrained?: boolean; hasServed?: boolean };
  if (!roleName) { res.status(400).json({ error: "roleName is required" }); return; }
  if (!isValidRoleName(roleName)) { res.status(400).json({ error: "Invalid roleName" }); return; }
  try {
    await db.insert(attendeeRolesTable).values({
      attendeeId: id,
      roleName,
      wantsToServeToday: wantsToServeToday ?? null,
      isTrained: isTrained ?? false,
      hasServed: hasServed ?? false,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /admin/attendees/:id/roles error:", err);
    res.status(500).json({ error: "Failed to add role" });
  }
});

router.patch("/admin/attendee-roles/:roleId/trained", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) { res.status(400).json({ error: "Invalid roleId" }); return; }
  const { isTrained } = req.body as { isTrained?: boolean };
  if (typeof isTrained !== "boolean") { res.status(400).json({ error: "isTrained must be boolean" }); return; }
  try {
    await db.update(attendeeRolesTable).set({ isTrained }).where(eq(attendeeRolesTable.id, roleId));
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /admin/attendee-roles/:roleId/trained error:", err);
    res.status(500).json({ error: "Failed to update trained status" });
  }
});

router.post("/admin/backfill-trained", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const volRegs = await db.select().from(volunteerPreRegistrationsTable).where(eq(volunteerPreRegistrationsTable.eventId, event.id));
    if (volRegs.length === 0) {
      res.json({ updated: 0, message: "No volunteer pre-registrations on file to match against." });
      return;
    }
    const attendees = await db.select().from(attendeesTable).where(eq(attendeesTable.eventId, event.id));
    const roles = await db.select().from(attendeeRolesTable).where(
      inArray(attendeeRolesTable.attendeeId, attendees.map((a) => a.id))
    );
    let updated = 0;
    for (const role of roles) {
      if (role.isTrained) continue;
      const attendee = attendees.find((a) => a.id === role.attendeeId);
      if (!attendee) continue;
      const match = volRegs.find(
        (v) => v.roleName === role.roleName &&
          v.firstName.toLowerCase() === attendee.firstName.toLowerCase() &&
          v.lastName.toLowerCase() === attendee.lastName.toLowerCase()
      );
      if (match) {
        await db.update(attendeeRolesTable).set({ isTrained: true }).where(eq(attendeeRolesTable.id, role.id));
        updated++;
      }
    }
    res.json({ updated, message: `Marked ${updated} role record(s) as trained based on volunteer pre-registration list.` });
  } catch (err) {
    console.error("POST /admin/backfill-trained error:", err);
    res.status(500).json({ error: "Backfill failed" });
  }
});

// ── Upload: pre-registrations (admin) ─────────────────────────────────────────

interface CsvRow { firstName: string; lastName: string; email: string; phone?: string; }

function parseHeader(h: string): string { return h.toLowerCase().trim().replace(/[^a-z0-9]/g, ""); }
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = ""; let inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(parseHeader);
  const col = (aliases: string[]) => {
    for (const a of aliases) { const i = headers.findIndex((h) => h === a || h.includes(a)); if (i >= 0) return i; }
    return -1;
  };
  const firstIdx = col(["firstname", "givenname", "first"]);
  const lastIdx = col(["lastname", "familyname", "last"]);
  const emailIdx = col(["email", "emailaddress"]);
  const phoneIdx = col(["mobilenumber", "phone", "mobile", "cellphone", "phonenumber"]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const email = emailIdx >= 0 ? cells[emailIdx]?.replace(/^"|"$/g, "").trim() ?? "" : "";
    const firstName = firstIdx >= 0 ? cells[firstIdx]?.replace(/^"|"$/g, "").trim() ?? "" : "";
    const lastName = lastIdx >= 0 ? cells[lastIdx]?.replace(/^"|"$/g, "").trim() ?? "" : "";
    const phone = phoneIdx >= 0 ? cells[phoneIdx]?.replace(/^"|"$/g, "").replace(/\D/g, "").trim() || undefined : undefined;
    if (email && email.includes("@")) rows.push({ firstName, lastName, email: email.toLowerCase(), phone });
  }
  return rows;
}

function mergeRows(a: CsvRow, b: CsvRow): CsvRow {
  return { firstName: b.firstName || a.firstName, lastName: b.lastName || a.lastName, email: a.email || b.email, phone: a.phone || b.phone };
}

type NameConflict = {
  email: string;
  option1: { firstName: string; lastName: string; context: string };
  option2: { firstName: string; lastName: string; context: string };
  recommendation: 1 | 2;
  recommendationReason: string;
};

router.post("/admin/upload-registrations", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const { csv } = req.body as { csv?: string };
  if (!csv || typeof csv !== "string") { res.status(400).json({ error: "Missing csv field" }); return; }
  const rawRows = parseCsv(csv);
  if (rawRows.length === 0) { res.status(400).json({ error: "No valid rows found in CSV. Ensure columns include email, first name, and last name." }); return; }

  const byEmail = new Map<string, CsvRow>();
  const byPhone = new Map<string, CsvRow>();
  const byName = new Map<string, CsvRow>();
  const nameConflicts: NameConflict[] = [];

  function findExisting(r: CsvRow) {
    const nameKey = `${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`;
    if (r.email && byEmail.has(r.email.toLowerCase())) return { record: byEmail.get(r.email.toLowerCase())!, byContact: true };
    if (r.phone && byPhone.has(r.phone)) return { record: byPhone.get(r.phone)!, byContact: true };
    const rec = byName.get(nameKey);
    if (rec) return { record: rec, byContact: false };
    return undefined;
  }
  function indexRow(r: CsvRow) {
    const nameKey = `${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`;
    if (r.email) byEmail.set(r.email.toLowerCase(), r);
    if (r.phone) byPhone.set(r.phone, r);
    byName.set(nameKey, r);
  }

  for (const r of rawRows) {
    const found = findExisting(r);
    if (found) {
      const { record: existing, byContact } = found;
      const existingName = `${existing.firstName} ${existing.lastName}`.trim().toLowerCase();
      const newName = `${r.firstName} ${r.lastName}`.trim().toLowerCase();
      if (byContact && existingName !== newName && existingName && newName) {
        nameConflicts.push({ email: existing.email || r.email, option1: { firstName: existing.firstName, lastName: existing.lastName, context: "Earlier entry in this file" }, option2: { firstName: r.firstName, lastName: r.lastName, context: "Later entry — more likely current" }, recommendation: 2, recommendationReason: "The later entry is more likely to reflect the correct current spelling" });
      }
      const merged = mergeRows(existing, r);
      const oldNameKey = `${existing.firstName.toLowerCase().trim()} ${existing.lastName.toLowerCase().trim()}`;
      byName.delete(oldNameKey);
      if (existing.email) byEmail.delete(existing.email.toLowerCase());
      if (existing.phone) byPhone.delete(existing.phone);
      Object.assign(existing, merged);
      indexRow(existing);
    } else {
      indexRow(r);
    }
  }

  const rows = Array.from(byName.values()).filter((r) => r.email && r.email.includes("@"));
  const event = res.locals.event;
  const existingRecs = await db.select().from(preRegistrationsTable).where(eq(preRegistrationsTable.eventId, event.id));
  const dbByEmail = new Map(existingRecs.map((r) => [r.email.toLowerCase(), r]));
  const dbByPhone = new Map(existingRecs.filter((r) => r.phone).map((r) => [r.phone!.replace(/\D/g, ""), r]));
  const dbByName = new Map(existingRecs.map((r) => [`${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`, r]));

  let inserted = 0; let skipped = 0;
  const toInsert: CsvRow[] = [];

  for (const row of rows) {
    const emailKey = row.email.toLowerCase();
    const phoneKey = row.phone?.replace(/\D/g, "");
    const nameKey = `${row.firstName.toLowerCase().trim()} ${row.lastName.toLowerCase().trim()}`;
    const newName = `${row.firstName} ${row.lastName}`.trim().toLowerCase();

    const emailMatch = dbByEmail.get(emailKey);
    if (emailMatch) {
      const dbName = `${emailMatch.firstName} ${emailMatch.lastName}`.trim().toLowerCase();
      if (dbName !== newName) { nameConflicts.push({ email: row.email, option1: { firstName: emailMatch.firstName, lastName: emailMatch.lastName, context: "Currently in our database" }, option2: { firstName: row.firstName, lastName: row.lastName, context: "New upload" }, recommendation: 2, recommendationReason: "The new upload is more recent — but if you manually corrected this name, keep option 1" }); }
      else { skipped++; }
      continue;
    }
    const phoneMatch = phoneKey ? dbByPhone.get(phoneKey) : undefined;
    if (phoneMatch) {
      const dbName = `${phoneMatch.firstName} ${phoneMatch.lastName}`.trim().toLowerCase();
      if (dbName !== newName || phoneMatch.email.toLowerCase() !== emailKey) { nameConflicts.push({ email: phoneMatch.email, option1: { firstName: phoneMatch.firstName, lastName: phoneMatch.lastName, context: `In our database (${phoneMatch.email})` }, option2: { firstName: row.firstName, lastName: row.lastName, context: `New upload (${row.email})` }, recommendation: 2, recommendationReason: "The new upload is more recent" }); }
      else { skipped++; }
      continue;
    }
    const nameMatch = dbByName.get(nameKey);
    if (nameMatch) {
      if (nameMatch.email.toLowerCase() !== emailKey) { nameConflicts.push({ email: nameMatch.email, option1: { firstName: nameMatch.firstName, lastName: nameMatch.lastName, context: `In our database (${nameMatch.email})` }, option2: { firstName: row.firstName, lastName: row.lastName, context: `New upload (${row.email})` }, recommendation: 2, recommendationReason: "The new upload is more recent" }); }
      else { skipped++; }
      continue;
    }
    toInsert.push(row);
  }

  try {
    const CHUNK = 100;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      await db.insert(preRegistrationsTable).values(chunk.map((r) => ({ ...r, eventId: event.id }))).onConflictDoNothing();
      inserted += chunk.length;
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(preRegistrationsTable).where(eq(preRegistrationsTable.eventId, event.id));
    res.json({ inserted, skipped, totalInDatabase: Number(count), nameConflicts });
  } catch (err) {
    console.error("POST /admin/upload-registrations error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.post("/admin/upload-registrations/resolve-name", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const { email, firstName, lastName } = req.body as { email?: string; firstName?: string; lastName?: string };
  if (!email || !firstName || lastName === undefined) { res.status(400).json({ error: "Missing required fields" }); return; }
  try {
    const event = res.locals.event;
    await db.update(preRegistrationsTable).set({ firstName, lastName })
      .where(and(eq(preRegistrationsTable.email, email), eq(preRegistrationsTable.eventId, event.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /admin/upload-registrations/resolve-name error:", err);
    res.status(500).json({ error: "Failed to resolve name" });
  }
});

router.post("/admin/upload-registrations/accept-both", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const { email, option1, option2 } = req.body as { email?: string; option1?: { firstName: string; lastName: string }; option2?: { firstName: string; lastName: string } };
  if (!email || !option1?.firstName || !option2?.firstName) { res.status(400).json({ error: "Missing required fields" }); return; }
  try {
    const event = res.locals.event;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.select().from(preRegistrationsTable).where(and(eq(preRegistrationsTable.email, normalizedEmail), eq(preRegistrationsTable.eventId, event.id)));
    if (existing.length === 0) {
      await db.insert(preRegistrationsTable).values({ firstName: option1.firstName, lastName: option1.lastName, email: normalizedEmail, sharedEmailWith: `${option2.firstName} ${option2.lastName}`, eventId: event.id });
    } else {
      await db.update(preRegistrationsTable).set({ firstName: option1.firstName, lastName: option1.lastName, needsEmailUpdate: false, sharedEmailWith: `${option2.firstName} ${option2.lastName}` }).where(and(eq(preRegistrationsTable.email, normalizedEmail), eq(preRegistrationsTable.eventId, event.id)));
    }
    await db.insert(preRegistrationsTable).values({ firstName: option2.firstName, lastName: option2.lastName, email: normalizedEmail, needsEmailUpdate: false, sharedEmailWith: `${option1.firstName} ${option1.lastName}`, eventId: event.id });
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /admin/upload-registrations/accept-both error:", err);
    res.status(500).json({ error: "Failed to accept both" });
  }
});

router.get("/admin/registrations/count", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(preRegistrationsTable).where(eq(preRegistrationsTable.eventId, event.id));
    res.json({ count: Number(count) });
  } catch (err) {
    console.error("GET /admin/registrations/count error:", err);
    res.status(500).json({ error: "Failed to count registrations" });
  }
});

// ── Upload: volunteers (admin) ────────────────────────────────────────────────

const ROLE_MAP: Record<string, string> = {
  "safety marshal": "safety_marshal", "safetymarshal": "safety_marshal",
  "medic": "medic",
  "de-escalator": "de_escalator", "deescalator": "de_escalator", "de escalator": "de_escalator",
  "chant lead": "chant_lead", "chantlead": "chant_lead",
  "information services": "information_services", "informationservices": "information_services",
  "info services": "information_services", "infoservices": "information_services",
};

function normalizeRole(raw: string): string | null {
  const key = raw.toLowerCase().trim().replace(/\s+/g, " ");
  return ROLE_MAP[key] ?? ROLE_MAP[key.replace(/\s/g, "")] ?? null;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

type RoleConflict = { firstName: string; lastName: string; oldRole: { roleName: string; title: string }; newRole: { roleName: string; title: string }; recommendationReason: string };

router.post("/admin/upload-volunteers", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = req.body as { rows?: unknown[] };
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "Missing or empty rows array" }); return; }

  interface VolunteerRow { firstName: string; lastName: string; email?: string; phone?: string; roleName: string; }
  const volunteers: VolunteerRow[] = [];
  const invalid: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i] as Record<string, string>;
    const row: Record<string, string> = {};
    for (const k of Object.keys(rawRow)) row[k.toLowerCase().trim()] = rawRow[k];
    const rawName = row.name ?? row.fullname ?? row["full name"] ?? "";
    const rawRole = row.role ?? row["volunteer role"] ?? "";
    const email = (row.email ?? "").trim().toLowerCase() || undefined;
    const phone = (row.phone ?? row["phone number"] ?? "").trim().replace(/\D/g, "") || undefined;
    const roleName = normalizeRole(rawRole) ?? (rawRole.trim().toLowerCase().replace(/\s+/g, "_") || null);
    if (!rawName.trim() || !roleName) { invalid.push(i + 1); continue; }
    const { firstName, lastName } = splitName(rawName);
    volunteers.push({ firstName, lastName, email, phone, roleName });
  }

  if (volunteers.length === 0) { res.status(400).json({ error: `No valid rows found. ${invalid.length} rows had issues.`, invalidRows: invalid }); return; }

  const volSeen = new Map<string, VolunteerRow>();
  for (const v of volunteers) { volSeen.set(`${v.firstName.toLowerCase().trim()} ${v.lastName.toLowerCase().trim()}`, v); }
  const deduped = Array.from(volSeen.values());

  try {
    const event = res.locals.event;
    const existingVols = await db.select().from(volunteerPreRegistrationsTable).where(eq(volunteerPreRegistrationsTable.eventId, event.id));
    const roleConflicts: RoleConflict[] = [];
    const toInsert: VolunteerRow[] = [];
    let skippedDuplicates = 0;

    for (const v of deduped) {
      const nameKey = `${v.firstName.toLowerCase().trim()} ${v.lastName.toLowerCase().trim()}`;
      const existing = existingVols.find((e) => `${e.firstName.toLowerCase().trim()} ${e.lastName.toLowerCase().trim()}` === nameKey);
      if (existing) {
        if (existing.roleName === v.roleName) { skippedDuplicates++; }
        else { roleConflicts.push({ firstName: v.firstName, lastName: v.lastName, oldRole: { roleName: existing.roleName, title: existing.roleName.replace(/_/g, " ") }, newRole: { roleName: v.roleName, title: v.roleName.replace(/_/g, " ") }, recommendationReason: "The new file's role is recommended as it reflects the most recent assignment" }); }
      } else { toInsert.push(v); }
    }

    if (toInsert.length > 0) {
      await db.insert(volunteerPreRegistrationsTable).values(toInsert.map((v) => ({ firstName: v.firstName, lastName: v.lastName, email: v.email ?? null, phone: v.phone ?? null, roleName: v.roleName, eventId: event.id })));
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(volunteerPreRegistrationsTable).where(eq(volunteerPreRegistrationsTable.eventId, event.id));
    res.json({ inserted: toInsert.length, skipped: skippedDuplicates, invalidRows: invalid, totalInDatabase: Number(count), roleConflicts });
  } catch (err) {
    console.error("POST /admin/upload-volunteers error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.post("/admin/upload-volunteers/resolve-role", requireEventAuth, async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, roleName } = req.body as { firstName?: string; lastName?: string; roleName?: string };
  if (!firstName || !lastName || !roleName) { res.status(400).json({ error: "Missing required fields" }); return; }
  try {
    const event = res.locals.event;
    await db.update(volunteerPreRegistrationsTable).set({ roleName }).where(and(eq(volunteerPreRegistrationsTable.firstName, firstName), eq(volunteerPreRegistrationsTable.lastName, lastName), eq(volunteerPreRegistrationsTable.eventId, event.id)));
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /admin/upload-volunteers/resolve-role error:", err);
    res.status(500).json({ error: "Failed to resolve role" });
  }
});

router.get("/admin/volunteers/count", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const event = res.locals.event;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(volunteerPreRegistrationsTable).where(eq(volunteerPreRegistrationsTable.eventId, event.id));
    res.json({ count: Number(count) });
  } catch (err) {
    console.error("GET /admin/volunteers/count error:", err);
    res.status(500).json({ error: "Failed to count volunteers" });
  }
});

// ── Check-in: lookup ──────────────────────────────────────────────────────────

async function findVolunteerPreRegForEvent(eventId: number, email: string, firstName: string) {
  let matches = await db
    .select()
    .from(volunteerPreRegistrationsTable)
    .where(and(eq(volunteerPreRegistrationsTable.eventId, eventId), eq(volunteerPreRegistrationsTable.email, email)))
    .limit(1);

  if (matches.length === 0) {
    const nameMatches = await db
      .select()
      .from(volunteerPreRegistrationsTable)
      .where(and(eq(volunteerPreRegistrationsTable.eventId, eventId), ilike(volunteerPreRegistrationsTable.firstName, firstName.trim())));
    if (nameMatches.length === 1) matches = nameMatches;
  }
  return matches[0] ?? null;
}

async function lookupInMobilize(
  firstName: string, email: string,
  mobilizeApiKey: string | null | undefined,
  mobilizeEventId: string | null | undefined
): Promise<{ found: boolean; mobilizeId?: string }> {
  const apiKey = mobilizeApiKey ?? process.env.MOBILIZE_API_KEY;
  const eventId = mobilizeEventId ?? process.env.MOBILIZE_EVENT_ID ?? "901026";
  if (!apiKey) return { found: false };
  try {
    const url = `https://api.mobilize.us/v1/organizations/events/${eventId}/participations?email=${encodeURIComponent(email)}&per_page=10`;
    const res2 = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res2.ok) { console.error("Mobilize API error:", res2.status, await res2.text()); return { found: false }; }
    const data = (await res2.json()) as { data?: { id: number; person?: { given_name?: string } }[] };
    const match = (data.data ?? []).find((p) => p.person?.given_name?.toLowerCase() === firstName.toLowerCase());
    if (match) return { found: true, mobilizeId: String(match.id) };
    return { found: false };
  } catch (err) {
    console.error("Mobilize lookup failed:", err);
    return { found: false };
  }
}

// ── Admin: toggle event active/completed status ───────────────────────────────
router.patch("/admin/status", requireEventAuth, async (_req: Request, res: Response): Promise<void> => {
  const event = res.locals.event;
  try {
    const updated = await db
      .update(eventsTable)
      .set({ isActive: !event.isActive })
      .where(eq(eventsTable.id, event.id))
      .returning({ isActive: eventsTable.isActive });
    res.json({ isActive: updated[0].isActive });
  } catch (err) {
    console.error("PATCH /admin/status error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.post("/check-in/lookup", checkinLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = LookupAttendeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { firstName, email, isVolunteer } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const event = res.locals.event;

  try {
    const existing = await db
      .select()
      .from(attendeesTable)
      .where(and(eq(attendeesTable.eventId, event.id), eq(attendeesTable.email, normalizedEmail)))
      .limit(1);

    if (existing.length > 0) {
      const sameFirstName = existing[0].firstName.toLowerCase() === firstName.toLowerCase().trim();
      if (!sameFirstName) {
        const sharedPreReg = await db
          .select()
          .from(preRegistrationsTable)
          .where(and(eq(preRegistrationsTable.eventId, event.id), eq(preRegistrationsTable.email, normalizedEmail), ilike(preRegistrationsTable.firstName, firstName.trim()), isNotNull(preRegistrationsTable.sharedEmailWith)))
          .limit(1);
        if (sharedPreReg.length > 0) {
          res.json({ found: false, alreadyCheckedIn: false, sharedEmail: true, sharedEmailWith: `${existing[0].firstName} ${existing[0].lastName}` });
          return;
        }
      }
      res.json({ found: existing[0].preRegistered, alreadyCheckedIn: true });
      return;
    }

    const volPreReg = await findVolunteerPreRegForEvent(event.id, normalizedEmail, firstName);

    if (isVolunteer) {
      res.json({ found: false, alreadyCheckedIn: false, volunteerPreReg: volPreReg ? { id: volPreReg.id, firstName: volPreReg.firstName, lastName: volPreReg.lastName, email: volPreReg.email ?? null, phone: volPreReg.phone ?? null, roleName: volPreReg.roleName } : null });
      return;
    }

    if (volPreReg) {
      res.json({ found: false, alreadyCheckedIn: false, volunteerPreReg: { id: volPreReg.id, firstName: volPreReg.firstName, lastName: volPreReg.lastName, email: volPreReg.email ?? null, phone: volPreReg.phone ?? null, roleName: volPreReg.roleName } });
      return;
    }

    const preRegs = await db
      .select()
      .from(preRegistrationsTable)
      .where(and(eq(preRegistrationsTable.eventId, event.id), eq(preRegistrationsTable.email, normalizedEmail)));

    if (preRegs.length > 0) {
      const nameMatch = preRegs.find((r) => r.firstName.toLowerCase().trim() === firstName.toLowerCase().trim()) ?? preRegs[0];
      res.json({ found: true, alreadyCheckedIn: false, foundFirstName: nameMatch.firstName, foundLastName: nameMatch.lastName });
      return;
    }

    const mobilize = await lookupInMobilize(firstName, email, res.locals.orgMobilizeApiKey, event.mobilizeEventId);
    res.json({ found: mobilize.found, mobilizeId: mobilize.mobilizeId ?? null, alreadyCheckedIn: false });
  } catch (err) {
    console.error("POST /check-in/lookup error:", err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// ── Check-in: submit ──────────────────────────────────────────────────────────

router.post("/check-in/submit", checkinLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = SubmitCheckInBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { firstName, lastName, email, phone, preRegistered, mobilizeId, wantsToBeContacted, roles } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const event = res.locals.event;

  try {
    const [newAttendee] = await db
      .insert(attendeesTable)
      .values({
        eventId: event.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: phone?.replace(/\D/g, "") || null,
        preRegistered,
        mobilizeId: mobilizeId ?? null,
        wantsToBeContacted: wantsToBeContacted ?? null,
      })
      .onConflictDoNothing()
      .returning();

    if (!newAttendee) {
      const [stored] = await db.select().from(attendeesTable).where(and(eq(attendeesTable.eventId, event.id), eq(attendeesTable.email, normalizedEmail))).limit(1);
      res.status(409).json({ error: "This email has already been checked in.", storedFirstName: stored?.firstName ?? "", storedLastName: stored?.lastName ?? "", attendeeId: stored?.id ?? null });
      return;
    }

    const isServingToday = roles?.some((r) => r.wantsToServeToday !== false) ?? false;
    const wonNoIceButton = event.giveawayEnabled && !isServingToday && Math.random() < 0.05;
    if (wonNoIceButton) {
      await db.update(attendeesTable).set({ isNoIceWinner: true }).where(eq(attendeesTable.id, newAttendee.id));
    }

    if (roles && roles.length > 0) {
      const fn = firstName.trim().toLowerCase();
      const ln = lastName.trim().toLowerCase();
      const volRegs = await db
        .select()
        .from(volunteerPreRegistrationsTable)
        .where(and(eq(volunteerPreRegistrationsTable.eventId, event.id), or(eq(volunteerPreRegistrationsTable.email, normalizedEmail), and(ilike(volunteerPreRegistrationsTable.firstName, fn), ilike(volunteerPreRegistrationsTable.lastName, ln)))));

      const resolvedRoles = roles.map((r) => ({
        attendeeId: newAttendee.id,
        roleName: r.roleName,
        isTrained: r.isTrained || volRegs.some((v) => v.roleName === r.roleName),
        hasServed: r.hasServed ?? false,
        wantsToServeToday: r.wantsToServeToday ?? null,
      }));

      await db.insert(attendeeRolesTable).values(resolvedRoles);
    }

    // ── QR re-entry: generate token + send SMS ───────────────────────────────
    // Only for consecutive-day events (smsReentryEnabled) with a phone number.
    // Fire-and-forget — don't block the check-in response.
    const phoneDigits = (phone?.replace(/\D/g, "") ?? "");
    if (event.smsReentryEnabled && phoneDigits.length >= 10) {
      const token = randomBytes(20).toString("hex");

      // Await token persistence so the link is guaranteed resolvable before we SMS it
      try {
        await db.update(attendeesTable)
          .set({ entryToken: token })
          .where(eq(attendeesTable.id, newAttendee.id));
      } catch (e) {
        console.error("[wristband] token save failed — skipping SMS:", e);
        // Don't send the SMS if we couldn't persist the token
        res.status(201).json({ id: newAttendee.id, message: "Check-in successful!", wonNoIceButton });
        return;
      }

      // Build the re-entry URL
      const baseUrl = process.env.CHECKIN_BASE_URL?.replace(/\/$/, "")
        ?? `${req.protocol}://${req.get("host")}`;
      const entryUrl = `${baseUrl}/${event.slug}/entry/${token}`;

      const smsBody = [
        `You're checked in to ${event.name}! 🎉`,
        `Save this — it's your re-entry code for the rest of the event:`,
        entryUrl,
        `(This message was sent from ${process.env.TELNYX_FROM_NUMBER ?? "the event system"}. Save it now!)`,
      ].join("\n");

      // SMS send is fire-and-forget (token is already saved; delivery failure is non-critical)
      sendSms(phoneDigits, smsBody)
        .catch((e) => console.error("[wristband] SMS send failed:", e));
    }

    res.status(201).json({ id: newAttendee.id, message: "Check-in successful!", wonNoIceButton });
  } catch (err) {
    console.error("POST /check-in/submit error:", err);
    res.status(500).json({ error: "Check-in failed" });
  }
});

// ── Check-in: correct name ────────────────────────────────────────────────────

router.post("/check-in/correct-name", async (req: Request, res: Response): Promise<void> => {
  const { attendeeId, email, firstName, lastName } = req.body as { attendeeId?: number; email?: string; firstName?: string; lastName?: string };
  if (!attendeeId || typeof attendeeId !== "number" || !email || !firstName) { res.status(400).json({ error: "Missing required fields" }); return; }

  const normalizedEmail = email.toLowerCase().trim().slice(0, 255);
  const safeFirst = firstName.trim().slice(0, 100);
  const safeLast = lastName !== undefined ? lastName.trim().slice(0, 100) : undefined;
  const event = res.locals.event;

  try {
    const [record] = await db.select({ id: attendeesTable.id }).from(attendeesTable).where(and(eq(attendeesTable.eventId, event.id), eq(attendeesTable.email, normalizedEmail))).limit(1);
    if (!record || record.id !== attendeeId) { res.status(403).json({ error: "Email does not match the record." }); return; }
    await db.update(attendeesTable).set({ firstName: safeFirst, ...(safeLast !== undefined ? { lastName: safeLast } : {}) }).where(eq(attendeesTable.id, attendeeId));
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /check-in/correct-name error:", err);
    res.status(500).json({ error: "Name correction failed" });
  }
});

// ── QR Wristband: scan / verify token ────────────────────────────────────────
// Called by the gate-staff scanner page after reading an attendee's QR code.
// Marks the token as used for today and returns attendee name.
//
// Rate-limited separately so a bad actor can't enumerate tokens.
const scanRateLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

router.get("/check-in/scan/:token", scanRateLimit, async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  if (!token || !/^[0-9a-f]{40}$/i.test(token)) {
    res.status(400).json({ error: "Invalid token format" });
    return;
  }

  const event = res.locals.event;

  // Session coverage: inactive events are already rejected with 403 (NOT_COVERED)
  // by the event resolver middleware above — they never reach this handler.
  // A QR_PASS covers all sessions for the duration of an active event.
  const passType = "QR_PASS" as const;

  const todayISO = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  try {
    // ── Atomic gate admission ─────────────────────────────────────────────────
    // Single conditional UPDATE.  PostgreSQL serialises concurrent UPDATEs on
    // the same row: the second call re-evaluates its WHERE after the first
    // commits, so two near-simultaneous scans cannot both return CLEARED.
    const cleared = await db
      .update(attendeesTable)
      .set({ entryTokenUsedDate: todayISO })
      .where(
        and(
          eq(attendeesTable.eventId, event.id),
          eq(attendeesTable.entryToken, token),
          // Only fire if NOT already marked for today (IS DISTINCT FROM handles NULLs)
          sql`${attendeesTable.entryTokenUsedDate} IS DISTINCT FROM ${todayISO}`,
        ),
      )
      .returning({
        id: attendeesTable.id,
        firstName: attendeesTable.firstName,
        lastName: attendeesTable.lastName,
        email: attendeesTable.email,
        preRegistered: attendeesTable.preRegistered,
      });

    if (cleared.length === 1) {
      // ── CLEARED: first admission for this attendee today ──────────────────
      res.json({
        ok: true,
        state: "CLEARED",
        passType,
        attendee: cleared[0],
      });
      return;
    }

    // 0 rows updated → ALREADY_ADMITTED or NOT_FOUND
    // A second SELECT is safe here — the gate outcome was already decided above.
    const [existing] = await db
      .select({
        id: attendeesTable.id,
        firstName: attendeesTable.firstName,
        lastName: attendeesTable.lastName,
        email: attendeesTable.email,
        preRegistered: attendeesTable.preRegistered,
      })
      .from(attendeesTable)
      .where(
        and(
          eq(attendeesTable.eventId, event.id),
          eq(attendeesTable.entryToken, token),
        ),
      )
      .limit(1);

    if (!existing) {
      // ── NOT_FOUND: token not on any attendee in this event (off-list) ──────
      res.status(404).json({ ok: false, state: "NOT_FOUND", passType, error: "Token not recognised" });
      return;
    }

    // ── ALREADY_ADMITTED: wristband already scanned today ────────────────────
    res.json({
      ok: true,
      state: "ALREADY_ADMITTED",
      passType,
      attendee: {
        id: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        preRegistered: existing.preRegistered,
      },
    });
  } catch (err) {
    console.error("GET /check-in/scan/:token error:", err);
    res.status(500).json({ ok: false, state: "ERROR", error: "Scan failed" });
  }
});

export default router;
