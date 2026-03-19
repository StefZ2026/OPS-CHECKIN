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

export default router;
