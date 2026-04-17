import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable, volunteerPreRegistrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// Role names are free-form text stored per-event — the hardcoded enum was removed
// when event roles became configurable. Basic sanitation: non-empty, <= 100 chars,
// alphanumeric + underscore + hyphen + space only (admin-protected routes already).
function isValidRoleName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 100 && /^[a-z0-9_\- ]+$/i.test(name);
}

const router: IRouter = Router();

router.get("/attendees", async (_req, res) => {
  const attendees = await db
    .select()
    .from(attendeesTable)
    .orderBy(attendeesTable.checkedInAt);

  const roles = await db.select().from(attendeeRolesTable);

  const rolesMap = new Map<number, typeof roles>();
  for (const role of roles) {
    if (!rolesMap.has(role.attendeeId)) {
      rolesMap.set(role.attendeeId, []);
    }
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
    roles: (rolesMap.get(a.id) || []).map((r) => ({
      id: r.id,
      roleName: r.roleName,
      isTrained: r.isTrained,
      hasServed: r.hasServed,
      wantsToServeToday: r.wantsToServeToday ?? null,
    })),
  }));

  res.json({ total, preRegisteredCount, walkInCount, attendees: result });
});

router.patch("/admin/attendees/:id", async (req, res) => {
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
    await db.update(attendeesTable).set(updates).where(eq(attendeesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /admin/attendees/:id failed:", err);
    res.status(500).json({ error: "Failed to update attendee" });
  }
});

router.put("/admin/attendee-roles/:roleId", async (req, res) => {
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
    console.error("PUT /admin/attendee-roles/:roleId failed:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.delete("/admin/attendee-roles/:roleId", async (req, res) => {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) { res.status(400).json({ error: "Invalid roleId" }); return; }
  try {
    await db.delete(attendeeRolesTable).where(eq(attendeeRolesTable.id, roleId));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /admin/attendee-roles/:roleId failed:", err);
    res.status(500).json({ error: "Failed to delete role" });
  }
});

router.post("/admin/attendees/:id/roles", async (req, res) => {
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
    console.error("POST /admin/attendees/:id/roles failed:", err);
    res.status(500).json({ error: "Failed to add role" });
  }
});

router.patch("/admin/attendee-roles/:roleId/trained", async (req, res) => {
  const roleId = parseInt(req.params.roleId);
  if (isNaN(roleId)) { res.status(400).json({ error: "Invalid roleId" }); return; }
  const { isTrained } = req.body as { isTrained?: boolean };
  if (typeof isTrained !== "boolean") { res.status(400).json({ error: "isTrained must be boolean" }); return; }
  try {
    await db.update(attendeeRolesTable).set({ isTrained }).where(eq(attendeeRolesTable.id, roleId));
    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /admin/attendee-roles/:roleId/trained failed:", err);
    res.status(500).json({ error: "Failed to update trained status" });
  }
});

router.post("/admin/backfill-trained", async (_req, res) => {
  const volRegs = await db.select().from(volunteerPreRegistrationsTable);
  if (volRegs.length === 0) {
    res.json({ updated: 0, message: "No volunteer pre-registrations on file to match against." });
    return;
  }

  const attendees = await db.select().from(attendeesTable);
  const roles = await db.select().from(attendeeRolesTable);

  let updated = 0;
  for (const role of roles) {
    if (role.isTrained) continue;
    const attendee = attendees.find(a => a.id === role.attendeeId);
    if (!attendee) continue;
    const match = volRegs.find(
      v =>
        v.roleName === role.roleName &&
        v.firstName.toLowerCase() === attendee.firstName.toLowerCase() &&
        v.lastName.toLowerCase() === attendee.lastName.toLowerCase()
    );
    if (match) {
      await db.update(attendeeRolesTable).set({ isTrained: true }).where(eq(attendeeRolesTable.id, role.id));
      updated++;
    }
  }

  res.json({ updated, message: `Marked ${updated} role record(s) as trained based on volunteer pre-registration list.` });
});

export default router;
