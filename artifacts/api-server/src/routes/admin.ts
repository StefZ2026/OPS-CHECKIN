import { createHash, timingSafeEqual } from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable, preRegistrationsTable, volunteerPreRegistrationsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

function expectedToken(): string {
  const password = process.env.ADMIN_PASSWORD ?? "";
  return createHash("sha256").update(password + ":icu-admin-2026").digest("hex");
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = expectedToken();
  let valid = false;
  try {
    valid = token.length === expected.length &&
      timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    valid = false;
  }
  if (!valid) {
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
  const { password } = req.body as { password?: string };
  if (!password || !process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: expectedToken() });
});

// Returns all pre-registrations (regular + volunteer) for full export
router.get("/admin/pre-registrations", requireAdminAuth, async (_req, res) => {
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
});

router.get("/admin/export", requireAdminAuth, async (_req, res) => {
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

  type ExportRow = {
    status: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    attendedAs: string;
    type: string;
    servedAtEvent: string;
    trainedRoles: string;
    priorServed: string;
    checkedInAt: string;
    wantsContact: string;
  };

  const exportRows: ExportRow[] = [];

  const buildAttendeeRow = (a: (typeof attendees)[0], status: string): ExportRow => {
    const aRoles = rolesMap.get(a.id) ?? [];
    const isVolunteer = aRoles.some(r => r.wantsToServeToday !== false);
    const servedAtEvent = aRoles.filter(r => r.wantsToServeToday !== false).map(r => r.roleName.replace(/_/g, " ")).join("; ");
    const trainedRoles = aRoles.filter(r => r.isTrained).map(r => r.roleName.replace(/_/g, " ")).join("; ");
    const priorServed = aRoles.filter(r => r.hasServed).map(r => r.roleName.replace(/_/g, " ")).join("; ");
    return {
      status,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      phone: a.phone ?? "",
      attendedAs: isVolunteer ? "Volunteer" : "Attendee",
      type: a.preRegistered ? "Pre-Registered" : "Walk-in",
      servedAtEvent,
      trainedRoles,
      priorServed,
      checkedInAt: a.checkedInAt.toISOString(),
      wantsContact: a.wantsToBeContacted === true ? "Yes" : a.wantsToBeContacted === false ? "No" : "Unknown",
    };
  };

  // Process regular pre-registrations
  for (const pr of preRegs) {
    const email = pr.email.toLowerCase();
    const attendee = attendeesByEmail.get(email);
    if (attendee) {
      coveredEmails.add(email);
      exportRows.push(buildAttendeeRow(attendee, "Checked In"));
    } else {
      exportRows.push({
        status: "No Show",
        firstName: pr.firstName,
        lastName: pr.lastName,
        email: pr.email,
        phone: pr.phone ?? "",
        attendedAs: "",
        type: "Pre-Registered",
        servedAtEvent: "",
        trainedRoles: "",
        priorServed: "",
        checkedInAt: "",
        wantsContact: "",
      });
    }
  }

  // Process volunteer pre-registrations
  for (const vr of volRegs) {
    const email = (vr.email ?? "").toLowerCase();
    const nameKey = `${vr.firstName.toLowerCase()} ${vr.lastName.toLowerCase()}`;
    if (email && attendeesByEmail.has(email) && !coveredEmails.has(email)) {
      const attendee = attendeesByEmail.get(email)!;
      coveredEmails.add(email);
      exportRows.push(buildAttendeeRow(attendee, "Checked In"));
    } else if (!email) {
      const nameMatch = attendees.find(a =>
        a.firstName.toLowerCase() === vr.firstName.toLowerCase() &&
        a.lastName.toLowerCase() === vr.lastName.toLowerCase()
      );
      if (nameMatch && !coveredEmails.has(nameMatch.email) && !coveredByName.has(nameKey)) {
        coveredEmails.add(nameMatch.email);
        coveredByName.add(nameKey);
        exportRows.push(buildAttendeeRow(nameMatch, "Checked In"));
      } else if (!nameMatch && !coveredByName.has(nameKey)) {
        coveredByName.add(nameKey);
        exportRows.push({
          status: "No Show",
          firstName: vr.firstName,
          lastName: vr.lastName,
          email: vr.email ?? "",
          phone: vr.phone ?? "",
          attendedAs: "",
          type: "Pre-Registered (Volunteer)",
          servedAtEvent: vr.roleName.replace(/_/g, " "),
          trainedRoles: "",
          priorServed: "",
          checkedInAt: "",
          wantsContact: "",
        });
      }
    }
  }

  // Walk-ins: attendees not covered by any pre-reg
  for (const attendee of attendees) {
    if (!coveredEmails.has(attendee.email.toLowerCase())) {
      exportRows.push(buildAttendeeRow(attendee, "Walk-in"));
    }
  }

  const header = ["Status", "First Name", "Last Name", "Email", "Phone", "Attended As", "Type", "Roles Served at NK3", "Roles Trained", "Prior Roles Served", "Checked In At", "Contact to Volunteer"].join(",");

  const rows = exportRows.map(r => [
    r.status,
    `"${r.firstName}"`,
    `"${r.lastName}"`,
    `"${r.email}"`,
    `"${r.phone}"`,
    r.attendedAs,
    r.type,
    `"${r.servedAtEvent}"`,
    `"${r.trainedRoles}"`,
    `"${r.priorServed}"`,
    `"${r.checkedInAt}"`,
    r.wantsContact,
  ].join(","));

  const csv = [header, ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="nk3-full-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
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
