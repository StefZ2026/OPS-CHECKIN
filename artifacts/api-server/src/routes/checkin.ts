import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable, preRegistrationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  LookupAttendeeBody,
  SubmitCheckInBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const MOBILIZE_API_KEY = process.env.MOBILIZE_API_KEY;
const MOBILIZE_EVENT_ID = process.env.MOBILIZE_EVENT_ID || "901026";

interface MobilizePerson {
  given_name?: string;
  family_name?: string;
  email_address?: string;
}

interface MobilizeParticipation {
  id: number;
  person?: MobilizePerson;
}

interface MobilizeResponse {
  data?: MobilizeParticipation[];
}

async function lookupInMobilize(
  firstName: string,
  email: string
): Promise<{ found: boolean; mobilizeId?: string }> {
  if (!MOBILIZE_API_KEY) {
    return { found: false };
  }

  try {
    const url = `https://api.mobilize.us/v1/organizations/events/${MOBILIZE_EVENT_ID}/participations?email=${encodeURIComponent(email)}&per_page=10`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${MOBILIZE_API_KEY}`,
      },
    });

    if (!res.ok) {
      console.error("Mobilize API error:", res.status, await res.text());
      return { found: false };
    }

    const data = (await res.json()) as MobilizeResponse;
    const participations = data.data ?? [];

    const match = participations.find((p) => {
      const nameMatch =
        p.person?.given_name?.toLowerCase() === firstName.toLowerCase();
      return nameMatch;
    });

    if (match) {
      return { found: true, mobilizeId: String(match.id) };
    }

    return { found: false };
  } catch (err) {
    console.error("Mobilize lookup failed:", err);
    return { found: false };
  }
}

router.post("/check-in/lookup", async (req, res) => {
  const parsed = LookupAttendeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { firstName, email } = parsed.data;

  const existing = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing.length > 0) {
    res.json({ found: existing[0].preRegistered, alreadyCheckedIn: true });
    return;
  }

  // Check the uploaded pre-registration CSV list first
  const preReg = await db
    .select()
    .from(preRegistrationsTable)
    .where(eq(preRegistrationsTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (preReg.length > 0) {
    res.json({ found: true, alreadyCheckedIn: false });
    return;
  }

  // Fall back to Mobilize API if key is available
  const mobilize = await lookupInMobilize(firstName, email);

  res.json({
    found: mobilize.found,
    mobilizeId: mobilize.mobilizeId ?? null,
    alreadyCheckedIn: false,
  });
});

router.post("/check-in/submit", async (req, res) => {
  const parsed = SubmitCheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { firstName, lastName, email, preRegistered, mobilizeId, roles } = parsed.data;

  const existing = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "This email has already been checked in." });
    return;
  }

  const [newAttendee] = await db
    .insert(attendeesTable)
    .values({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      preRegistered,
      mobilizeId: mobilizeId ?? null,
    })
    .returning();

  if (roles && roles.length > 0) {
    await db.insert(attendeeRolesTable).values(
      roles.map((r) => ({
        attendeeId: newAttendee.id,
        roleName: r.roleName as "safety_marshal" | "medic" | "de_escalator" | "chant_lead",
        isTrained: r.isTrained,
      }))
    );
  }

  res.status(201).json({ id: newAttendee.id, message: "Check-in successful!" });
});

export default router;
