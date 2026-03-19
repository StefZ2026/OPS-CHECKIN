import { createHash } from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

function expectedToken(): string {
  const password = process.env.ADMIN_PASSWORD ?? "";
  return createHash("sha256").update(password + ":icu-admin-2026").digest("hex");
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers["authorization"] ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== expectedToken()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.post("/admin/login", (req, res) => {
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

router.get("/admin/export", requireAdminAuth, async (_req, res) => {
  const attendees = await db.select().from(attendeesTable).orderBy(attendeesTable.checkedInAt);
  const roles = await db.select().from(attendeeRolesTable);

  const rolesMap = new Map<number, typeof roles>();
  for (const role of roles) {
    if (!rolesMap.has(role.attendeeId)) rolesMap.set(role.attendeeId, []);
    rolesMap.get(role.attendeeId)!.push(role);
  }

  const header = ["First Name", "Last Name", "Email", "Type", "Checked In At", "Roles", "Trained Roles"].join(",");

  const rows = attendees.map((a) => {
    const aRoles = rolesMap.get(a.id) ?? [];
    const roleNames = aRoles.map((r) => r.roleName.replace(/_/g, " ")).join("; ");
    const trainedRoles = aRoles.filter((r) => r.isTrained).map((r) => r.roleName.replace(/_/g, " ")).join("; ");
    return [
      `"${a.firstName}"`,
      `"${a.lastName}"`,
      `"${a.email}"`,
      a.preRegistered ? "Pre-Registered" : "Walk-in",
      `"${a.checkedInAt.toISOString()}"`,
      `"${roleNames}"`,
      `"${trainedRoles}"`,
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="nk3-checkins-${new Date().toISOString().slice(0, 10)}.csv"`);
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
