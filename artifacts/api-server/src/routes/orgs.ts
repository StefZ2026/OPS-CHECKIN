import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { organizationsTable, eventsTable, attendeesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireUserAuth } from "./auth";

const router = Router();

// GET /api/orgs/:orgId — get org info (auth required)
router.get("/:orgId", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  // Only allow access to their own org (or superadmin)
  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const rows = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!rows[0]) { res.status(404).json({ error: "Org not found" }); return; }
  res.json(rows[0]);
});

// GET /api/orgs/:orgId/events — list org events with check-in counts
router.get("/:orgId/events", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const events = await db.select().from(eventsTable).where(eq(eventsTable.orgId, orgId));

  const withCounts = await Promise.all(
    events.map(async (e) => {
      const countRow = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(attendeesTable)
        .where(eq(attendeesTable.eventId, e.id));
      return { ...e, checkedInCount: countRow[0]?.count ?? 0 };
    })
  );

  res.json(withCounts);
});

export default router;
