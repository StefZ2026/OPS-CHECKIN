import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable, preRegistrationsTable, volunteerPreRegistrationsTable } from "@workspace/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";
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

  const { firstName, email, isVolunteer } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check if already checked in
  const existing = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    res.json({ found: existing[0].preRegistered, alreadyCheckedIn: true });
    return;
  }

  // Volunteer path: look up in volunteer pre-registrations
  if (isVolunteer) {
    // First try email match
    let volMatch = await db
      .select()
      .from(volunteerPreRegistrationsTable)
      .where(eq(volunteerPreRegistrationsTable.email, normalizedEmail))
      .limit(1);

    // Fall back to first-name match if no email match
    if (volMatch.length === 0) {
      const nameMatches = await db
        .select()
        .from(volunteerPreRegistrationsTable)
        .where(ilike(volunteerPreRegistrationsTable.firstName, firstName.trim()));

      // Only use name match if exactly one result (unambiguous)
      if (nameMatches.length === 1) {
        volMatch = nameMatches;
      }
    }

    if (volMatch.length > 0) {
      res.json({
        found: false,
        alreadyCheckedIn: false,
        volunteerPreReg: {
          id: volMatch[0].id,
          firstName: volMatch[0].firstName,
          lastName: volMatch[0].lastName,
          email: volMatch[0].email ?? null,
          phone: volMatch[0].phone ?? null,
          roleName: volMatch[0].roleName,
        },
      });
      return;
    }

    // Not found in volunteer list
    res.json({ found: false, alreadyCheckedIn: false, volunteerPreReg: null });
    return;
  }

  // Regular attendee path: FIRST check volunteer pre-reg list so volunteers
  // don't accidentally get checked in as regular attendees
  let volCheckMatch = await db
    .select()
    .from(volunteerPreRegistrationsTable)
    .where(eq(volunteerPreRegistrationsTable.email, normalizedEmail))
    .limit(1);

  if (volCheckMatch.length === 0) {
    const nameMatches = await db
      .select()
      .from(volunteerPreRegistrationsTable)
      .where(ilike(volunteerPreRegistrationsTable.firstName, firstName.trim()));
    if (nameMatches.length === 1) volCheckMatch = nameMatches;
  }

  if (volCheckMatch.length > 0) {
    res.json({
      found: false,
      alreadyCheckedIn: false,
      volunteerPreReg: {
        id: volCheckMatch[0].id,
        firstName: volCheckMatch[0].firstName,
        lastName: volCheckMatch[0].lastName,
        email: volCheckMatch[0].email ?? null,
        phone: volCheckMatch[0].phone ?? null,
        roleName: volCheckMatch[0].roleName,
      },
    });
    return;
  }

  // Check the pre-registration CSV list
  const preReg = await db
    .select()
    .from(preRegistrationsTable)
    .where(eq(preRegistrationsTable.email, normalizedEmail))
    .limit(1);

  if (preReg.length > 0) {
    res.json({
      found: true,
      alreadyCheckedIn: false,
      foundFirstName: preReg[0].firstName,
      foundLastName: preReg[0].lastName,
    });
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

  const { firstName, lastName, email, phone, preRegistered, mobilizeId, roles } = parsed.data;

  const normalizedEmailSubmit = email.toLowerCase().trim();

  // Use INSERT ... ON CONFLICT DO NOTHING to atomically prevent duplicates
  // even under concurrent load — no race condition between check and insert
  const [newAttendee] = await db
    .insert(attendeesTable)
    .values({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmailSubmit,
      phone: phone?.replace(/\D/g, "") || null,
      preRegistered,
      mobilizeId: mobilizeId ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!newAttendee) {
    // Email already exists — fetch the stored record to return useful info
    const [stored] = await db
      .select()
      .from(attendeesTable)
      .where(eq(attendeesTable.email, normalizedEmailSubmit))
      .limit(1);
    res.status(409).json({
      error: "This email has already been checked in.",
      storedFirstName: stored?.firstName ?? "",
      storedLastName: stored?.lastName ?? "",
      attendeeId: stored?.id ?? null,
    });
    return;
  }

  if (roles && roles.length > 0) {
    // Targeted query — only fetch volunteer records matching this person by email or full name
    const fn = firstName.trim().toLowerCase();
    const ln = lastName.trim().toLowerCase();
    const volRegs = await db
      .select()
      .from(volunteerPreRegistrationsTable)
      .where(
        or(
          eq(volunteerPreRegistrationsTable.email, normalizedEmailSubmit),
          and(
            ilike(volunteerPreRegistrationsTable.firstName, fn),
            ilike(volunteerPreRegistrationsTable.lastName, ln)
          )
        )
      );

    const resolvedRoles = roles.map((r) => {
      const onVolList = volRegs.some((v) => v.roleName === r.roleName);
      return {
        attendeeId: newAttendee.id,
        roleName: r.roleName as "safety_marshal" | "medic" | "de_escalator" | "chant_lead" | "information_services",
        isTrained: r.isTrained || onVolList,
      };
    });

    await db.insert(attendeeRolesTable).values(resolvedRoles);
  }

  res.status(201).json({ id: newAttendee.id, message: "Check-in successful!" });
});

// Self-service name correction — requires attendeeId + email so a random ID alone cannot update anyone
router.post("/check-in/correct-name", async (req, res) => {
  const { attendeeId, email, firstName, lastName } = req.body as {
    attendeeId?: number;
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  if (!attendeeId || typeof attendeeId !== "number" || !email || !firstName) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim().slice(0, 255);
  const safeFirst = firstName.trim().slice(0, 100);
  const safeLast = lastName !== undefined ? lastName.trim().slice(0, 100) : undefined;

  // Verify the email matches the record being updated
  const [record] = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(eq(attendeesTable.email, normalizedEmail))
    .limit(1);

  if (!record || record.id !== attendeeId) {
    res.status(403).json({ error: "Email does not match the record." });
    return;
  }

  await db.update(attendeesTable)
    .set({ firstName: safeFirst, ...(safeLast !== undefined ? { lastName: safeLast } : {}) })
    .where(eq(attendeesTable.id, attendeeId));

  res.json({ ok: true });
});

export default router;
