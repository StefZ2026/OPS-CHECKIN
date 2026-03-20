import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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
    preRegistered: a.preRegistered,
    mobilizeId: a.mobilizeId ?? null,
    checkedInAt: a.checkedInAt.toISOString(),
    roles: (rolesMap.get(a.id) || []).map((r) => ({
      roleName: r.roleName,
      isTrained: r.isTrained,
    })),
  }));

  res.json({ total, preRegisteredCount, walkInCount, attendees: result });
});

router.patch("/admin/attendees/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { firstName, lastName, phone } = req.body as { firstName?: string; lastName?: string; phone?: string };
  const updates: Record<string, string | null> = {};
  if (firstName !== undefined) updates.firstName = firstName.trim();
  if (lastName !== undefined) updates.lastName = lastName.trim();
  if (phone !== undefined) updates.phone = phone.replace(/\D/g, "") || null;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  await db.update(attendeesTable).set(updates).where(eq(attendeesTable.id, id));
  res.json({ ok: true });
});

export default router;
