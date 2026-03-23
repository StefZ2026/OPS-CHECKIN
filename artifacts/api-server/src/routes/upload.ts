import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { preRegistrationsTable, volunteerPreRegistrationsTable } from "@workspace/db/schema";
import { requireAdminAuth } from "./admin";
import { sql, eq, and } from "drizzle-orm";

const router: IRouter = Router();

// ─── Shared types ────────────────────────────────────────────────────────────

interface CsvRow {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

type NameConflict = {
  email: string;
  option1: { firstName: string; lastName: string; context: string };
  option2: { firstName: string; lastName: string; context: string };
  recommendation: 1 | 2;
  recommendationReason: string;
};

// Merges two CSV rows referring to the same person.
// Later entry (b) wins for name; both contribute to contact info.
function mergeRows(a: CsvRow, b: CsvRow): CsvRow {
  return {
    firstName: b.firstName || a.firstName,
    lastName:  b.lastName  || a.lastName,
    email: a.email || b.email,
    phone: a.phone || b.phone,
  };
}

function parseHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(parseHeader);

  const col = (aliases: string[]) => {
    for (const a of aliases) {
      const i = headers.findIndex((h) => h === a || h.includes(a));
      if (i >= 0) return i;
    }
    return -1;
  };

  const firstIdx = col(["firstname", "givenname", "first"]);
  const lastIdx = col(["lastname", "familyname", "last"]);
  const emailIdx = col(["email", "emailaddress"]);
  const phoneIdx = col(["mobilenumber", "phone", "mobile", "cellphone", "phonenumber"]);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const email = emailIdx >= 0 ? cells[emailIdx]?.replace(/^"|"$/g, "").trim() ?? "" : "";
    const firstName = firstIdx >= 0 ? cells[firstIdx]?.replace(/^"|"$/g, "").trim() ?? "" : "";
    const lastName = lastIdx >= 0 ? cells[lastIdx]?.replace(/^"|"$/g, "").trim() ?? "" : "";
    const phone = phoneIdx >= 0 ? cells[phoneIdx]?.replace(/^"|"$/g, "").replace(/\D/g, "").trim() || undefined : undefined;
    if (email && email.includes("@")) {
      rows.push({ firstName, lastName, email: email.toLowerCase(), phone });
    }
  }
  return rows;
}

router.post("/admin/upload-registrations", requireAdminAuth, async (req, res) => {
  const { csv } = req.body as { csv?: string };
  if (!csv || typeof csv !== "string") {
    res.status(400).json({ error: "Missing csv field" });
    return;
  }

  const rawRows = parseCsv(csv);
  if (rawRows.length === 0) {
    res.status(400).json({ error: "No valid rows found in CSV. Ensure columns include email, first name, and last name." });
    return;
  }

  // Deduplicate within the file on a per-record basis:
  // Same name, same email, OR same phone = same person. Merge to keep the best data.
  const byEmail = new Map<string, CsvRow>();
  const byPhone = new Map<string, CsvRow>();
  const byName = new Map<string, CsvRow>();

  const nameConflicts: NameConflict[] = [];

  function findExisting(r: CsvRow): { record: CsvRow; byContact: boolean } | undefined {
    const nameKey = `${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`;
    if (r.email && byEmail.has(r.email.toLowerCase())) return { record: byEmail.get(r.email.toLowerCase())!, byContact: true };
    if (r.phone && byPhone.has(r.phone)) return { record: byPhone.get(r.phone)!, byContact: true };
    const rec = byName.get(nameKey);
    if (rec) return { record: rec, byContact: false };
    return undefined;
  }

  function indexRow(r: CsvRow) {
    const nameKey = `${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`;
    if (r.email) byEmail.set(r.email.toLowerCase(), r);
    if (r.phone) byPhone.set(r.phone, r);
    byName.set(nameKey, r);
  }

  for (const r of rawRows) {
    const found = findExisting(r);
    if (found) {
      const { record: existing, byContact } = found;
      const existingName = `${existing.firstName} ${existing.lastName}`.trim().toLowerCase();
      const newName = `${r.firstName} ${r.lastName}`.trim().toLowerCase();

      // Same contact info, different name spelling → flag for admin review
      if (byContact && existingName !== newName && existingName && newName) {
        nameConflicts.push({
          email: existing.email || r.email,
          option1: { firstName: existing.firstName, lastName: existing.lastName, context: "Earlier entry in this file" },
          option2: { firstName: r.firstName, lastName: r.lastName, context: "Later entry — more likely current" },
          recommendation: 2,
          recommendationReason: "The later entry is more likely to reflect the correct current spelling",
        });
      }

      const merged = mergeRows(existing, r);
      const oldNameKey = `${existing.firstName.toLowerCase().trim()} ${existing.lastName.toLowerCase().trim()}`;
      byName.delete(oldNameKey);
      if (existing.email) byEmail.delete(existing.email.toLowerCase());
      if (existing.phone) byPhone.delete(existing.phone);
      Object.assign(existing, merged);
      indexRow(existing);
    } else {
      indexRow(r);
    }
  }

  // Final list: unique records that have at least an email
  const rows = Array.from(byName.values()).filter(r => r.email && r.email.includes("@"));

  // Load existing DB records to cross-reference — never auto-update, always flag conflicts
  const existingRecs = await db.select().from(preRegistrationsTable);
  const dbByEmail = new Map(existingRecs.map(r => [r.email.toLowerCase(), r]));
  const dbByPhone = new Map(
    existingRecs.filter(r => r.phone).map(r => [r.phone!.replace(/\D/g, ""), r])
  );
  const dbByName = new Map(
    existingRecs.map(r => [`${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`, r])
  );

  let inserted = 0;
  let skipped = 0;
  const toInsert: CsvRow[] = [];

  for (const row of rows) {
    const emailKey = row.email.toLowerCase();
    const phoneKey = row.phone?.replace(/\D/g, "");
    const nameKey = `${row.firstName.toLowerCase().trim()} ${row.lastName.toLowerCase().trim()}`;
    const newName = `${row.firstName} ${row.lastName}`.trim().toLowerCase();

    // 1. Email match
    const emailMatch = dbByEmail.get(emailKey);
    if (emailMatch) {
      const dbName = `${emailMatch.firstName} ${emailMatch.lastName}`.trim().toLowerCase();
      if (dbName !== newName) {
        // Same email, different name — flag for admin to pick correct one
        nameConflicts.push({
          email: row.email,
          option1: { firstName: emailMatch.firstName, lastName: emailMatch.lastName, context: "Currently in our database" },
          option2: { firstName: row.firstName, lastName: row.lastName, context: "New Mobilize upload" },
          recommendation: 2,
          recommendationReason: "The Mobilize upload is more recent — but if you manually corrected this name, keep option 1",
        });
      } else {
        skipped++; // Exact match — already up to date
      }
      continue;
    }

    // 2. Phone match (same person, email may have changed)
    const phoneMatch = phoneKey ? dbByPhone.get(phoneKey) : undefined;
    if (phoneMatch) {
      const dbName = `${phoneMatch.firstName} ${phoneMatch.lastName}`.trim().toLowerCase();
      if (dbName !== newName || phoneMatch.email.toLowerCase() !== emailKey) {
        nameConflicts.push({
          email: phoneMatch.email, // use existing email as the key for resolution
          option1: { firstName: phoneMatch.firstName, lastName: phoneMatch.lastName, context: `In our database (${phoneMatch.email})` },
          option2: { firstName: row.firstName, lastName: row.lastName, context: `New Mobilize upload (${row.email})` },
          recommendation: 2,
          recommendationReason: "The Mobilize upload is more recent",
        });
      } else {
        skipped++;
      }
      continue;
    }

    // 3. Name match (same person, contact info may have changed)
    const nameMatch = dbByName.get(nameKey);
    if (nameMatch) {
      if (nameMatch.email.toLowerCase() !== emailKey) {
        nameConflicts.push({
          email: nameMatch.email,
          option1: { firstName: nameMatch.firstName, lastName: nameMatch.lastName, context: `In our database (${nameMatch.email})` },
          option2: { firstName: row.firstName, lastName: row.lastName, context: `New Mobilize upload (${row.email})` },
          recommendation: 2,
          recommendationReason: "The Mobilize upload is more recent",
        });
      } else {
        skipped++;
      }
      continue;
    }

    // 4. Genuinely new person — queue for insert
    toInsert.push(row);
  }

  // Batch inserts in chunks of 100 for performance
  const CHUNK = 100;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    await db.insert(preRegistrationsTable).values(chunk).onConflictDoNothing();
    inserted += chunk.length;
  }

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(preRegistrationsTable);

  res.json({ inserted, skipped, totalInDatabase: Number(total[0].count), nameConflicts });
});

// Admin picks the correct spelling for a name conflict
router.post("/admin/upload-registrations/resolve-name", requireAdminAuth, async (req, res) => {
  const { email, firstName, lastName } = req.body as { email?: string; firstName?: string; lastName?: string };
  if (!email || !firstName || lastName === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  await db.update(preRegistrationsTable)
    .set({ firstName, lastName })
    .where(eq(preRegistrationsTable.email, email));
  res.json({ ok: true });
});

router.get("/admin/registrations/count", requireAdminAuth, async (_req, res) => {
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(preRegistrationsTable);
  res.json({ count: Number(total[0].count) });
});

type VolunteerRoleName = "safety_marshal" | "medic" | "de_escalator" | "chant_lead" | "information_services";

const ROLE_TITLES: Record<string, string> = {
  safety_marshal: "Safety Marshal",
  medic: "Medic",
  de_escalator: "De-escalator",
  chant_lead: "Chant Lead",
  information_services: "Information Services",
};

// Used to validate incoming roleName values before writing to the database
const VALID_ROLE_NAMES = new Set<string>(Object.keys(ROLE_TITLES));

const ROLE_MAP: Record<string, VolunteerRoleName> = {
  "safety marshal": "safety_marshal",
  "safetymarshal": "safety_marshal",
  "medic": "medic",
  "de-escalator": "de_escalator",
  "deescalator": "de_escalator",
  "de escalator": "de_escalator",
  "chant lead": "chant_lead",
  "chantlead": "chant_lead",
  "information services": "information_services",
  "informationservices": "information_services",
  "info services": "information_services",
  "infoservices": "information_services",
};

function normalizeRole(raw: string): VolunteerRoleName | null {
  const key = raw.toLowerCase().trim().replace(/\s+/g, " ");
  return ROLE_MAP[key] ?? ROLE_MAP[key.replace(/\s/g, "")] ?? null;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName };
}

interface VolunteerRow {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  roleName: VolunteerRoleName;
}

type RoleConflict = {
  firstName: string;
  lastName: string;
  oldRole: { roleName: string; title: string };
  newRole: { roleName: string; title: string };
  recommendationReason: string;
};

router.post("/admin/upload-volunteers", requireAdminAuth, async (req, res) => {
  const { rows } = req.body as { rows?: unknown[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Missing or empty rows array" });
    return;
  }

  const volunteers: VolunteerRow[] = [];
  const invalid: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rawRow = rows[i] as Record<string, string>;
    // Normalize all column keys to lowercase so any capitalization works
    const row: Record<string, string> = {};
    for (const k of Object.keys(rawRow)) row[k.toLowerCase().trim()] = rawRow[k];

    const rawName = row.name ?? row.fullname ?? row["full name"] ?? "";
    const rawRole = row.role ?? row["volunteer role"] ?? "";
    const email = (row.email ?? "").trim().toLowerCase() || undefined;
    const rawPhone = (row.phone ?? row["phone number"] ?? "").trim();
    const phone = rawPhone.replace(/\D/g, "") || undefined;

    const roleName = normalizeRole(rawRole);
    if (!rawName.trim() || !roleName) {
      invalid.push(i + 1);
      continue;
    }

    const { firstName, lastName } = splitName(rawName);
    volunteers.push({ firstName, lastName, email, phone, roleName });
  }

  if (volunteers.length === 0) {
    res.status(400).json({
      error: `No valid rows found. Ensure columns include Name and Role. ${invalid.length} rows had issues.`,
      invalidRows: invalid,
    });
    return;
  }

  // Deduplicate within the uploaded file by name+role — last occurrence wins
  const volSeen = new Map<string, VolunteerRow>();
  for (const v of volunteers) {
    const key = `${v.firstName.toLowerCase().trim()} ${v.lastName.toLowerCase().trim()}`;
    volSeen.set(key, v);
  }
  const deduped = Array.from(volSeen.values());

  // Load existing volunteers to merge against
  const existingVols = await db.select().from(volunteerPreRegistrationsTable);

  const roleConflicts: RoleConflict[] = [];
  const toInsert: VolunteerRow[] = [];
  let skippedDuplicates = 0;

  for (const v of deduped) {
    const nameKey = `${v.firstName.toLowerCase().trim()} ${v.lastName.toLowerCase().trim()}`;
    const existing = existingVols.find(e =>
      `${e.firstName.toLowerCase().trim()} ${e.lastName.toLowerCase().trim()}` === nameKey
    );

    if (existing) {
      if (existing.roleName === v.roleName) {
        // Exact duplicate — already in the list, skip
        skippedDuplicates++;
      } else {
        // Same person, different role — surface as a conflict for admin to resolve
        roleConflicts.push({
          firstName: v.firstName,
          lastName: v.lastName,
          oldRole: { roleName: existing.roleName, title: ROLE_TITLES[existing.roleName] ?? existing.roleName },
          newRole: { roleName: v.roleName, title: ROLE_TITLES[v.roleName] ?? v.roleName },
          recommendationReason: "The new file's role is recommended as it reflects the most recent assignment",
        });
      }
    } else {
      // New volunteer — add them
      toInsert.push(v);
    }
  }

  if (toInsert.length > 0) {
    await db.insert(volunteerPreRegistrationsTable).values(
      toInsert.map(v => ({
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email ?? null,
        phone: v.phone ?? null,
        roleName: v.roleName,
      }))
    );
  }

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(volunteerPreRegistrationsTable);

  res.json({
    inserted: toInsert.length,
    skipped: skippedDuplicates,
    invalidRows: invalid,
    totalInDatabase: Number(total[0].count),
    roleConflicts,
  });
});

// Admin picks the correct role when a volunteer's role changed between uploads
router.post("/admin/upload-volunteers/resolve-role", requireAdminAuth, async (req, res) => {
  const { firstName, lastName, roleName } = req.body as { firstName?: string; lastName?: string; roleName?: string };
  if (!firstName || !lastName || !roleName) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (!VALID_ROLE_NAMES.has(roleName)) {
    res.status(400).json({ error: "Invalid role name" });
    return;
  }
  await db.update(volunteerPreRegistrationsTable)
    .set({ roleName: roleName as VolunteerRoleName })
    .where(and(
      eq(volunteerPreRegistrationsTable.firstName, firstName),
      eq(volunteerPreRegistrationsTable.lastName, lastName)
    ));
  res.json({ ok: true });
});

router.get("/admin/volunteers/count", requireAdminAuth, async (_req, res) => {
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(volunteerPreRegistrationsTable);
  res.json({ count: Number(total[0].count) });
});

export default router;
