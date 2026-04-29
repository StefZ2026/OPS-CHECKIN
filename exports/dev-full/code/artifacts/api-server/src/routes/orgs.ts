import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { organizationsTable, eventsTable, attendeesTable, eventRolesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireUserAuth } from "./auth";

const router = Router();

// GET /api/orgs/:orgId — get org info (auth required)
router.get("/:orgId", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const rows = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!rows[0]) { res.status(404).json({ error: "Org not found" }); return; }
  res.json(rows[0]);
});

// PATCH /api/orgs/:orgId/settings — update org profile (org_contact or superadmin)
router.patch("/:orgId/settings", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const {
    name, contactName, contactEmail,
    phone, address, city, state, zip,
    website, instagramUrl, twitterUrl, facebookUrl,
    logoUrl,
  } = req.body as Partial<{
    name: string; contactName: string; contactEmail: string;
    phone: string; address: string; city: string; state: string; zip: string;
    website: string; instagramUrl: string; twitterUrl: string; facebookUrl: string;
    logoUrl: string;
  }>;

  // At least one field required
  const hasAnyField = [name, contactName, contactEmail, phone, address, city, state, zip, website, instagramUrl, twitterUrl, facebookUrl, logoUrl].some((v) => v !== undefined);
  if (!hasAnyField) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  if (name !== undefined && !name.trim()) {
    res.status(400).json({ error: "Name cannot be empty" });
    return;
  }

  const patch: Record<string, string | null> = {};
  if (name !== undefined) patch.name = name.trim();
  if (contactName !== undefined) patch.contactName = contactName.trim() || null;
  if (contactEmail !== undefined) patch.contactEmail = contactEmail.trim().toLowerCase() || null;
  if (phone !== undefined) patch.phone = phone.trim() || null;
  if (address !== undefined) patch.address = address.trim() || null;
  if (city !== undefined) patch.city = city.trim() || null;
  if (state !== undefined) patch.state = state.trim() || null;
  if (zip !== undefined) patch.zip = zip.trim() || null;
  if (website !== undefined) patch.website = website.trim() || null;
  if (instagramUrl !== undefined) patch.instagramUrl = instagramUrl.trim() || null;
  if (twitterUrl !== undefined) patch.twitterUrl = twitterUrl.trim() || null;
  if (facebookUrl !== undefined) patch.facebookUrl = facebookUrl.trim() || null;
  if (logoUrl !== undefined) patch.logoUrl = logoUrl || null;

  try {
    const [updated] = await db
      .update(organizationsTable)
      .set(patch)
      .where(eq(organizationsTable.id, orgId))
      .returning();

    if (!updated) { res.status(404).json({ error: "Org not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("PATCH /orgs/:orgId/settings error:", err);
    res.status(500).json({ error: "Failed to update org settings" });
  }
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

// POST /api/orgs/:orgId/events — create a new event for this org (org_contact or superadmin)
router.post("/:orgId/events", requireUserAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(req.params.orgId);
  const user = res.locals.user;

  if (user.role !== "superadmin" && user.orgId !== orgId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { name, slug, eventDate, roles } = req.body as {
    name?: string;
    slug?: string;
    eventDate?: string;
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

  const [event] = await db
    .insert(eventsTable)
    .values({
      name: name.trim(),
      slug: slugClean,
      orgId,
      eventDate: eventDate ? new Date(eventDate) : null,
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
