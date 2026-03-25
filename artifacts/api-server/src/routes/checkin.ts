import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { attendeesTable, attendeeRolesTable, preRegistrationsTable, volunteerPreRegistrationsTable } from "@workspace/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";
import {
  LookupAttendeeBody,
  SubmitCheckInBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Looks up a volunteer pre-registration by email first, then falls back to
// first-name match — but only if it's unambiguous (exactly one result).
async function findVolunteerPreReg(email: string, firstName: string) {
  let matches = await db
    .select()
    .from(volunteerPreRegistrationsTable)
    .where(eq(volunteerPreRegistrationsTable.email, email))
    .limit(1);

  if (matches.length === 0) {
    const nameMatches = await db
      .select()
      .from(volunteerPreRegistrationsTable)
      .where(ilike(volunteerPreRegistrationsTable.firstName, firstName.trim()));
    if (nameMatches.length === 1) matches = nameMatches;
  }

  return matches[0] ?? null;
}

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
    // Email is taken — but check if this is a different person sharing the same email.
    // A shared-email pre-reg record has needsEmailUpdate=true and firstName matching who just arrived.
    const sharedPreReg = await db
      .select()
      .from(preRegistrationsTable)
      .where(
        and(
          eq(preRegistrationsTable.email, normalizedEmail),
          ilike(preRegistrationsTable.firstName, firstName.trim()),
          eq(preRegistrationsTable.needsEmailUpdate, true)
        )
      )
      .limit(1);

    if (sharedPreReg.length > 0) {
      // This is the second person — they need to supply a new email before checking in
      res.json({
        found: false,
        alreadyCheckedIn: false,
        sharedEmail: true,
        sharedEmailWith: `${existing[0].firstName} ${existing[0].lastName}`,
      });
      return;
    }

    res.json({ found: existing[0].preRegistered, alreadyCheckedIn: true });
    return;
  }

  // Volunteer path AND regular-attendee path both check the volunteer pre-reg list.
  // For volunteers: surface their pre-reg details so they can confirm.
  // For regular attendees: catch people who forgot to tap "I'm a volunteer".
  const volPreReg = await findVolunteerPreReg(normalizedEmail, firstName);

  if (isVolunteer) {
    res.json({
      found: false,
      alreadyCheckedIn: false,
      volunteerPreReg: volPreReg
        ? { id: volPreReg.id, firstName: volPreReg.firstName, lastName: volPreReg.lastName, email: volPreReg.email ?? null, phone: volPreReg.phone ?? null, roleName: volPreReg.roleName }
        : null,
    });
    return;
  }

  if (volPreReg) {
    res.json({
      found: false,
      alreadyCheckedIn: false,
      volunteerPreReg: { id: volPreReg.id, firstName: volPreReg.firstName, lastName: volPreReg.lastName, email: volPreReg.email ?? null, phone: volPreReg.phone ?? null, roleName: volPreReg.roleName },
    });
    return;
  }

  // Check the pre-registration CSV list.
  // Multiple records can share one email (shared-email couples), so fetch all and
  // prefer the one whose first name matches what was typed.
  const preRegs = await db
    .select()
    .from(preRegistrationsTable)
    .where(eq(preRegistrationsTable.email, normalizedEmail));

  if (preRegs.length > 0) {
    const nameMatch = preRegs.find(
      r => r.firstName.toLowerCase().trim() === firstName.toLowerCase().trim()
    ) ?? preRegs[0];

    res.json({
      found: true,
      alreadyCheckedIn: false,
      foundFirstName: nameMatch.firstName,
      foundLastName: nameMatch.lastName,
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

  // ~1-in-20 chance, truly random — not sequential so it can't be gamed by counting
  const wonNoIceButton = Math.random() < 0.05;
  if (wonNoIceButton) {
    await db.update(attendeesTable).set({ isNoIceWinner: true }).where(eq(attendeesTable.id, newAttendee.id));
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
        hasServed: r.hasServed ?? false,
        wantsToServeToday: r.wantsToServeToday ?? null,
      };
    });

    await db.insert(attendeeRolesTable).values(resolvedRoles);
  }

  res.status(201).json({ id: newAttendee.id, message: "Check-in successful!", wonNoIceButton });
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
