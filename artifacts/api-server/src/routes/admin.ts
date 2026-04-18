import { createHash, timingSafeEqual } from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable, preRegistrationsTable, volunteerPreRegistrationsTable, eventsTable, eventRolesTable, organizationsTable, usersTable } from "@workspace/db/schema";
import { eq, inArray, count } from "drizzle-orm";

const router: IRouter = Router();

function expectedToken(): string {
  const password = process.env.ADMIN_PASSWORD ?? "";
  return createHash("sha256").update(password + ":opscheckin-admin-2026").digest("hex");
}

function expectedSuperadminToken(): string {
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  return createHash("sha256").update(password + ":icu-superadmin-2026").digest("hex");
}

function checkBearer(token: string, expected: string): boolean {
  try {
    return token.length === expected.length &&
      timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin auth is not configured on this server." });
    return;
  }
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!checkBearer(token, expectedToken())) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function requireSuperadminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.SUPERADMIN_PASSWORD) {
    res.status(503).json({ error: "Superadmin auth is not configured on this server." });
    return;
  }
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!checkBearer(token, expectedSuperadminToken())) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// 20 failed attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
});

router.post("/admin/login", loginLimiter, (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!password || !process.env.ADMIN_PASSWORD || !username) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const expectedUsername = process.env.ADMIN_USERNAME ?? "";
  if (username !== expectedUsername || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  res.json({ token: expectedToken() });
});

router.post("/superadmin/login", loginLimiter, (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || !process.env.SUPERADMIN_PASSWORD) {
    res.status(503).json({ error: "Superadmin auth is not configured on this server." });
    return;
  }
  if (password.trim() !== process.env.SUPERADMIN_PASSWORD.trim()) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: expectedSuperadminToken() });
});

// Returns all pre-registrations (regular + volunteer) for full export
router.get("/admin/pre-registrations", requireAdminAuth, async (_req, res) => {
  try {
    const [preRegs, volRegs] = await Promise.all([
      db.select().from(preRegistrationsTable),
      db.select().from(volunteerPreRegistrationsTable),
    ]);

    const attendee = preRegs.map(r => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone ?? null,
      source: "attendee" as const,
      roleName: null,
    }));

    const volunteer = volRegs.map(r => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email ?? null,
      phone: r.phone ?? null,
      source: "volunteer" as const,
      roleName: r.roleName,
    }));

    res.json({ preRegistrations: [...attendee, ...volunteer] });
  } catch (err) {
    console.error("pre-registrations route error:", err);
    res.status(500).json({ error: "Failed to load pre-registrations" });
  }
});

// ── Shared export logic ──────────────────────────────────────────────────────

type ExportRow = {
  "Status": string; "First Name": string; "Last Name": string; "Email": string;
  "Phone": string; "Attended As": string; "Type": string;
  "Roles Served at NK3": string; "Roles Trained": string; "Prior Roles Served": string;
  "Checked In At": string; "Future Volunteer?": string;
};

async function buildExportRows(): Promise<ExportRow[]> {
  const [attendees, roles, preRegs, volRegs] = await Promise.all([
    db.select().from(attendeesTable).orderBy(attendeesTable.checkedInAt),
    db.select().from(attendeeRolesTable),
    db.select().from(preRegistrationsTable),
    db.select().from(volunteerPreRegistrationsTable),
  ]);

  const rolesMap = new Map<number, typeof roles>();
  for (const role of roles) {
    if (!rolesMap.has(role.attendeeId)) rolesMap.set(role.attendeeId, []);
    rolesMap.get(role.attendeeId)!.push(role);
  }

  const attendeesByEmail = new Map(attendees.map(a => [a.email.toLowerCase(), a]));
  const coveredEmails = new Set<string>();
  const coveredByName = new Set<string>();
  const rows: ExportRow[] = [];

  const toRow = (a: (typeof attendees)[0], status: string): ExportRow => {
    const aRoles = rolesMap.get(a.id) ?? [];
    const isVolunteer = aRoles.some(r => r.wantsToServeToday !== false);
    return {
      "Status": status,
      "First Name": a.firstName,
      "Last Name": a.lastName,
      "Email": a.email,
      "Phone": a.phone ?? "",
      "Attended As": isVolunteer ? "Volunteer" : "Attendee",
      "Type": a.preRegistered ? "Pre-Registered" : "Walk-in",
      "Roles Served at NK3": aRoles.filter(r => r.wantsToServeToday !== false).map(r => r.roleName.replace(/_/g, " ")).join("; "),
      "Roles Trained": aRoles.filter(r => r.isTrained).map(r => r.roleName.replace(/_/g, " ")).join("; "),
      "Prior Roles Served": aRoles.filter(r => r.hasServed).map(r => r.roleName.replace(/_/g, " ")).join("; "),
      "Checked In At": a.checkedInAt.toISOString(),
      "Future Volunteer?": a.wantsToBeContacted === true ? "Yes" : a.wantsToBeContacted === false ? "No" : "Unknown",
    };
  };

  const notCheckedIn = (p: { firstName: string; lastName: string; email: string; phone: string | null; type: string; role?: string }): ExportRow => ({
    "Status": "Not Checked In",
    "First Name": p.firstName, "Last Name": p.lastName,
    "Email": p.email, "Phone": p.phone ?? "",
    "Attended As": "", "Type": p.type,
    "Roles Served at NK3": p.role ?? "", "Roles Trained": "", "Prior Roles Served": "",
    "Checked In At": "", "Future Volunteer?": "",
  });

  for (const pr of preRegs) {
    const email = pr.email.toLowerCase();
    const attendee = attendeesByEmail.get(email);
    if (attendee) { coveredEmails.add(email); rows.push(toRow(attendee, "Checked In")); }
    else rows.push(notCheckedIn({ firstName: pr.firstName, lastName: pr.lastName, email: pr.email, phone: pr.phone, type: "Pre-Registered" }));
  }

  for (const vr of volRegs) {
    const email = (vr.email ?? "").toLowerCase();
    const nameKey = `${vr.firstName.toLowerCase()} ${vr.lastName.toLowerCase()}`;
    if (email && attendeesByEmail.has(email) && !coveredEmails.has(email)) {
      const a = attendeesByEmail.get(email)!; coveredEmails.add(email); rows.push(toRow(a, "Checked In"));
    } else if (!email) {
      const nameMatch = attendees.find(a => a.firstName.toLowerCase() === vr.firstName.toLowerCase() && a.lastName.toLowerCase() === vr.lastName.toLowerCase());
      if (nameMatch && !coveredEmails.has(nameMatch.email) && !coveredByName.has(nameKey)) {
        coveredEmails.add(nameMatch.email); coveredByName.add(nameKey); rows.push(toRow(nameMatch, "Checked In"));
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

// ── XLSX export ───────────────────────────────────────────────────────────────

router.get("/admin/export-xlsx", requireAdminAuth, async (_req, res) => {
  const exportRows = await buildExportRows();
  const ws = XLSX.utils.json_to_sheet(exportRows, {
    header: ["Status", "First Name", "Last Name", "Email", "Phone", "Attended As", "Type", "Roles Served at NK3", "Roles Trained", "Prior Roles Served", "Checked In At", "Future Volunteer?"],
  });
  ws["!cols"] = [
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 32 }, { wch: 16 },
    { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 22 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Full Roster");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="nk3-full-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

// ── Superadmin: Organization Management ───────────────────────────────────────

// List all organizations with event counts
router.get("/superadmin/orgs", requireSuperadminAuth, async (_req, res) => {
  try {
    const orgs = await db.select().from(organizationsTable).orderBy(organizationsTable.name);
    const eventCounts = await db
      .select({ orgId: eventsTable.orgId, eventCount: count() })
      .from(eventsTable)
      .groupBy(eventsTable.orgId);
    const countMap = new Map<number, number>();
    for (const row of eventCounts) {
      if (row.orgId !== null) countMap.set(row.orgId, row.eventCount);
    }
    res.json({
      orgs: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        mobilizeApiKey: o.mobilizeApiKey ? "••••••••" : null,
        createdAt: o.createdAt,
        eventCount: countMap.get(o.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error("GET /superadmin/orgs error:", err);
    res.status(500).json({ error: "Failed to load organizations" });
  }
});

// Create a new organization
router.post("/superadmin/orgs", requireSuperadminAuth, async (req, res) => {
  const { name, slug, mobilizeApiKey } = req.body as {
    name?: string; slug?: string; mobilizeApiKey?: string;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  if (!slug?.trim()) { res.status(400).json({ error: "slug is required" }); return; }
  if (!/^[a-z0-9-]+$/.test(slug.trim())) {
    res.status(400).json({ error: "slug must be lowercase letters, numbers, and hyphens only" });
    return;
  }
  try {
    const [org] = await db
      .insert(organizationsTable)
      .values({ name: name.trim(), slug: slug.trim(), mobilizeApiKey: mobilizeApiKey?.trim() || null })
      .returning();
    res.status(201).json({ org });
  } catch (err: unknown) {
    const pgCode = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: `An organization with slug '${slug}' already exists` });
      return;
    }
    console.error("POST /superadmin/orgs error:", err);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

// ── Superadmin: Event Management ──────────────────────────────────────────────
// Protected by the dedicated SUPERADMIN_PASSWORD env var, separate from ADMIN_PASSWORD.

// List all events with their orgs and roles
router.get("/superadmin/events", requireSuperadminAuth, async (_req, res) => {
  try {
    const events = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        slug: eventsTable.slug,
        eventDate: eventsTable.eventDate,
        giveawayEnabled: eventsTable.giveawayEnabled,
        mobilizeEventId: eventsTable.mobilizeEventId,
        isActive: eventsTable.isActive,
        createdAt: eventsTable.createdAt,
        orgId: eventsTable.orgId,
        orgName: organizationsTable.name,
        orgSlug: organizationsTable.slug,
      })
      .from(eventsTable)
      .leftJoin(organizationsTable, eq(eventsTable.orgId, organizationsTable.id))
      .orderBy(eventsTable.createdAt);

    const [allRoles, attendeeCounts] = await Promise.all([
      db.select().from(eventRolesTable).orderBy(eventRolesTable.sortOrder),
      db
        .select({ eventId: attendeesTable.eventId, checkedInCount: count() })
        .from(attendeesTable)
        .groupBy(attendeesTable.eventId),
    ]);

    const rolesMap = new Map<number, typeof allRoles>();
    for (const role of allRoles) {
      if (!rolesMap.has(role.eventId)) rolesMap.set(role.eventId, []);
      rolesMap.get(role.eventId)!.push(role);
    }

    const countMap = new Map<number, number>();
    for (const row of attendeeCounts) {
      if (row.eventId !== null) countMap.set(row.eventId, row.checkedInCount);
    }

    const result = events.map((e) => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      eventDate: e.eventDate,
      giveawayEnabled: e.giveawayEnabled,
      mobilizeEventId: e.mobilizeEventId,
      isActive: e.isActive,
      createdAt: e.createdAt,
      checkedInCount: countMap.get(e.id) ?? 0,
      org: { id: e.orgId, name: e.orgName, slug: e.orgSlug },
      roles: (rolesMap.get(e.id) ?? []).map((r) => ({
        id: r.id,
        roleKey: r.roleKey,
        displayName: r.displayName,
        sortOrder: r.sortOrder,
      })),
    }));

    res.json({ events: result });
  } catch (err) {
    console.error("GET /superadmin/events error:", err);
    res.status(500).json({ error: "Failed to load events" });
  }
});

type NewRoleInput = { roleKey: string; displayName: string; sortOrder?: number };

// Create a new event under an org, with optional volunteer roles
router.post("/superadmin/events", requireSuperadminAuth, async (req, res) => {
  const {
    orgSlug,
    name,
    slug,
    eventDate,
    adminPassword,
    mobilizeEventId,
    giveawayEnabled,
    roles,
  } = req.body as {
    orgSlug?: string;
    name?: string;
    slug?: string;
    eventDate?: string;
    adminPassword?: string;
    mobilizeEventId?: string;
    giveawayEnabled?: boolean;
    roles?: NewRoleInput[];
  };

  if (!name || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!slug || !slug.trim()) {
    res.status(400).json({ error: "slug is required" });
    return;
  }
  if (!/^[a-z0-9-]+$/.test(slug.trim())) {
    res.status(400).json({ error: "slug must be lowercase letters, numbers, and hyphens only" });
    return;
  }

  try {
    // Resolve org — default to 'icu' if not specified
    const resolvedOrgSlug = (orgSlug ?? "icu").trim();
    const orgRows = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, resolvedOrgSlug))
      .limit(1);
    if (!orgRows[0]) {
      res.status(400).json({ error: `Organization '${resolvedOrgSlug}' not found` });
      return;
    }
    const org = orgRows[0];

    const validRoles = (roles ?? [])
      .filter((r) => r.roleKey?.trim() && r.displayName?.trim())
      .map((r, i) => ({
        roleKey: r.roleKey.trim(),
        displayName: r.displayName.trim(),
        sortOrder: r.sortOrder ?? i + 1,
      }));

    // Wrap event + role creation in a transaction so a role insert failure
    // doesn't leave a partially-configured event behind.
    const { newEvent, insertedRoles } = await db.transaction(async (tx) => {
      const [newEvent] = await tx
        .insert(eventsTable)
        .values({
          orgId: org.id,
          name: name.trim(),
          slug: slug.trim(),
          eventDate: eventDate ? new Date(eventDate) : null,
          adminPassword: adminPassword?.trim() || null,
          mobilizeEventId: mobilizeEventId?.trim() || null,
          giveawayEnabled: giveawayEnabled ?? false,
          isActive: true,
        })
        .returning();

      let insertedRoles: typeof eventRolesTable.$inferSelect[] = [];
      if (validRoles.length > 0) {
        insertedRoles = await tx
          .insert(eventRolesTable)
          .values(validRoles.map((r) => ({ ...r, eventId: newEvent.id })))
          .returning();
      }
      return { newEvent, insertedRoles };
    });

    res.status(201).json({
      event: {
        ...newEvent,
        roles: insertedRoles.map((r) => ({ id: r.id, roleKey: r.roleKey, displayName: r.displayName, sortOrder: r.sortOrder })),
      },
    });
  } catch (err: unknown) {
    // Drizzle wraps PG errors in DrizzleQueryError; the original pg code is on .cause
    const pgCode =
      (err as { code?: string }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      res.status(409).json({ error: `An event with slug '${slug}' already exists` });
      return;
    }
    console.error("POST /superadmin/events error:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// Update an existing event (name, date, password, mobilize ID, giveaway, active status)
router.patch("/superadmin/events/:id", requireSuperadminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event id" });
    return;
  }

  const {
    name,
    eventDate,
    adminPassword,
    mobilizeEventId,
    giveawayEnabled,
    isActive,
  } = req.body as {
    name?: string;
    eventDate?: string | null;
    adminPassword?: string | null;
    mobilizeEventId?: string | null;
    giveawayEnabled?: boolean;
    isActive?: boolean;
  };

  const updates: Partial<typeof eventsTable.$inferInsert> = {};

  if (name !== undefined) {
    if (!name.trim()) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    updates.name = name.trim();
  }
  if (eventDate !== undefined) {
    if (eventDate) {
      const parsed = new Date(eventDate);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: "Invalid eventDate — expected ISO date string or null" });
        return;
      }
      updates.eventDate = parsed;
    } else {
      updates.eventDate = null;
    }
  }
  if (adminPassword !== undefined) {
    updates.adminPassword = adminPassword?.trim() || null;
  }
  if (mobilizeEventId !== undefined) {
    updates.mobilizeEventId = mobilizeEventId?.trim() || null;
  }
  if (giveawayEnabled !== undefined) {
    updates.giveawayEnabled = giveawayEnabled;
  }
  if (isActive !== undefined) {
    updates.isActive = isActive;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(eventsTable)
      .set(updates)
      .where(eq(eventsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const roles = await db
      .select()
      .from(eventRolesTable)
      .where(eq(eventRolesTable.eventId, id))
      .orderBy(eventRolesTable.sortOrder);

    const orgRows = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, updated.orgId))
      .limit(1);

    const org = orgRows[0];

    res.json({
      event: {
        ...updated,
        org: { id: org?.id ?? updated.orgId, name: org?.name ?? null, slug: org?.slug ?? null },
        roles: roles.map((r) => ({ id: r.id, roleKey: r.roleKey, displayName: r.displayName, sortOrder: r.sortOrder })),
      },
    });
  } catch (err) {
    console.error("PATCH /superadmin/events/:id error:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// ── User Management (superadmin) ─────────────────────────────────────────────

// GET /api/superadmin/users — list all platform users (org contacts + event managers)
router.get("/superadmin/users", requireSuperadminAuth, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      orgId: usersTable.orgId,
      eventId: usersTable.eventId,
      passwordSet: usersTable.passwordSet,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  const orgIds = [...new Set(users.filter((u) => u.orgId).map((u) => u.orgId!))];
  const eventIds = [...new Set(users.filter((u) => u.eventId).map((u) => u.eventId!))];

  const [orgs, events] = await Promise.all([
    orgIds.length > 0
      ? db.select({ id: organizationsTable.id, name: organizationsTable.name, slug: organizationsTable.slug }).from(organizationsTable).where(inArray(organizationsTable.id, orgIds))
      : [],
    eventIds.length > 0
      ? db.select({ id: eventsTable.id, name: eventsTable.name, slug: eventsTable.slug }).from(eventsTable).where(inArray(eventsTable.id, eventIds))
      : [],
  ]);

  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  const eventMap = new Map(events.map((e) => [e.id, e]));

  res.json({
    users: users.map((u) => ({
      ...u,
      org: u.orgId ? (orgMap.get(u.orgId) ?? null) : null,
      event: u.eventId ? (eventMap.get(u.eventId) ?? null) : null,
    })),
  });
});

// POST /api/superadmin/users — create a new org contact or event manager
router.post("/superadmin/users", requireSuperadminAuth, async (req, res) => {
  const { name, email, role, orgId, eventId } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    orgId?: number;
    eventId?: number;
  };

  if (!name?.trim() || !email?.trim() || !role) {
    res.status(400).json({ error: "name, email, and role are required" });
    return;
  }
  if (!["org_contact", "event_manager"].includes(role)) {
    res.status(400).json({ error: "role must be org_contact or event_manager" });
    return;
  }
  if (role === "org_contact" && !orgId) {
    res.status(400).json({ error: "orgId is required for org_contact" });
    return;
  }
  if (role === "event_manager" && !eventId) {
    res.status(400).json({ error: "eventId is required for event_manager" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  // For event_manager, pull orgId from the event so the user is linked to the right org too
  let resolvedOrgId = orgId ?? null;
  if (role === "event_manager" && eventId) {
    const eventRow = await db
      .select({ orgId: eventsTable.orgId })
      .from(eventsTable)
      .where(eq(eventsTable.id, eventId))
      .limit(1);
    resolvedOrgId = eventRow[0]?.orgId ?? null;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      orgId: resolvedOrgId,
      eventId: role === "event_manager" ? (eventId ?? null) : null,
      passwordSet: false,
    })
    .returning();

  res.status(201).json({ user });
});

router.delete("/admin/attendees", requireAdminAuth, async (req, res) => {
  const { emails } = req.body as { emails?: string[] };
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: "Provide an array of emails to delete." });
    return;
  }
  const normalised = emails.map((e: string) => e.toLowerCase().trim());
  const toDelete = await db.select({ id: attendeesTable.id, email: attendeesTable.email })
    .from(attendeesTable)
    .where(inArray(attendeesTable.email, normalised));

  if (toDelete.length === 0) {
    res.json({ deleted: 0, message: "No matching records found." });
    return;
  }

  const ids = toDelete.map(a => a.id);
  await db.delete(attendeeRolesTable).where(inArray(attendeeRolesTable.attendeeId, ids));
  await db.delete(attendeesTable).where(inArray(attendeesTable.id, ids));

  res.json({ deleted: toDelete.length, emails: toDelete.map(a => a.email) });
});

export default router;
