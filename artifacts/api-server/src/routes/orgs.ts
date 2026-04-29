import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { organizationsTable, eventsTable, attendeesTable, attendeeRolesTable, eventRolesTable } from "@workspace/db/schema";
import { eq, sql, inArray, count, countDistinct } from "drizzle-orm";
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

// GET /api/orgs/:orgId/events — list org events with check-in + volunteer counts
router.get("/:orgId/events", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const events = await db.select().from(eventsTable).where(eq(eventsTable.orgId, orgId));
  if (events.length === 0) { res.json([]); return; }

  const eventIds = events.map(e => e.id);

  const [totalCounts, volCounts] = await Promise.all([
    db.select({ eventId: attendeesTable.eventId, total: count() })
      .from(attendeesTable)
      .where(inArray(attendeesTable.eventId, eventIds))
      .groupBy(attendeesTable.eventId),
    db.select({ eventId: attendeesTable.eventId, volunteers: countDistinct(attendeesTable.id) })
      .from(attendeesTable)
      .innerJoin(attendeeRolesTable, eq(attendeeRolesTable.attendeeId, attendeesTable.id))
      .where(inArray(attendeesTable.eventId, eventIds))
      .groupBy(attendeesTable.eventId),
  ]);

  const totalMap = new Map(totalCounts.map(r => [r.eventId, r.total]));
  const volMap = new Map(volCounts.map(r => [r.eventId, r.volunteers]));

  const withCounts = events.map(e => {
    const total = totalMap.get(e.id) ?? 0;
    const volunteers = volMap.get(e.id) ?? 0;
    return { ...e, checkedInCount: total, volunteerCount: volunteers, attendeeCount: total - volunteers };
  });

  res.json(withCounts);
});

// POST /api/orgs/:orgId/events — create a new event for this org (org_contact or superadmin)
router.post("/:orgId/events", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { name, slug, eventDate, eventDates, smsReentryEnabled, roles } = req.body as {
    name?: string;
    slug?: string;
    eventDate?: string;
    eventDates?: string[];
    smsReentryEnabled?: boolean;
    roles?: { roleKey: string; displayName: string }[];
  };

  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  const slugClean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const existing = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(eq(eventsTable.slug, slugClean))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "An event with this slug already exists. Choose a different one." });
    return;
  }

  // For multi-day events, eventDates is an array of YYYY-MM-DD strings.
  // eventDate is the first day (display date); eventDates gates access per day.
  const allDates = eventDates && eventDates.length > 0 ? eventDates : (eventDate ? [eventDate] : []);
  const primaryDate = allDates[0] ? new Date(allDates[0]) : null;
  const datesJson = allDates.length > 1 ? JSON.stringify(allDates) : null;

  const [event] = await db
    .insert(eventsTable)
    .values({
      name: name.trim(),
      slug: slugClean,
      orgId,
      eventDate: primaryDate,
      eventDates: datesJson,
      smsReentryEnabled: smsReentryEnabled ?? false,
      isActive: true,
      giveawayEnabled: false,
    })
    .returning();

  if (roles && roles.length > 0) {
    await db.insert(eventRolesTable).values(
      roles.map((r, i) => ({
        eventId: event.id,
        roleKey: r.roleKey,
        displayName: r.displayName,
        sortOrder: i,
      }))
    );
  }

  res.status(201).json({ event });
});

export default router;
