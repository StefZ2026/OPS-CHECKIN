import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { preRegistrationsTable, volunteerPreRegistrationsTable } from "@workspace/db/schema";
import { requireAdminAuth } from "./admin";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

interface CsvRow {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
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

  function mergeRows(a: CsvRow, b: CsvRow): CsvRow {
    return {
      firstName: b.firstName || a.firstName,
      lastName: b.lastName || a.lastName,
      email: b.email || a.email,
      phone: b.phone || a.phone,
    };
  }

  function findExisting(r: CsvRow): CsvRow | undefined {
    const nameKey = `${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`;
    if (r.email && byEmail.has(r.email.toLowerCase())) return byEmail.get(r.email.toLowerCase());
    if (r.phone && byPhone.has(r.phone)) return byPhone.get(r.phone);
    if (nameKey.trim() !== " ") return byName.get(nameKey);
    return undefined;
  }

  function indexRow(r: CsvRow) {
    const nameKey = `${r.firstName.toLowerCase().trim()} ${r.lastName.toLowerCase().trim()}`;
    if (r.email) byEmail.set(r.email.toLowerCase(), r);
    if (r.phone) byPhone.set(r.phone, r);
    byName.set(nameKey, r);
  }

  for (const r of rawRows) {
    const existing = findExisting(r);
    if (existing) {
      const merged = mergeRows(existing, r);
      // Remove old index entries and re-index with merged data
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

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      await db
        .insert(preRegistrationsTable)
        .values(row)
        .onConflictDoUpdate({
          target: preRegistrationsTable.email,
          set: {
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone ?? null,
          },
        });
      inserted++;
    } catch {
      skipped++;
    }
  }

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(preRegistrationsTable);

  res.json({ inserted, skipped, totalInDatabase: Number(total[0].count) });
});

router.get("/admin/registrations/count", requireAdminAuth, async (_req, res) => {
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(preRegistrationsTable);
  res.json({ count: Number(total[0].count) });
});

type VolunteerRoleName = "safety_marshal" | "medic" | "de_escalator" | "chant_lead" | "information_services";

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

router.post("/admin/upload-volunteers", requireAdminAuth, async (req, res) => {
  const { rows } = req.body as { rows?: unknown[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Missing or empty rows array" });
    return;
  }

  const volunteers: VolunteerRow[] = [];
  const invalid: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, string>;
    const rawName = row.name ?? row.fullname ?? row.fullName ?? row["full name"] ?? row["Full Name"] ?? "";
    const rawRole = row.role ?? row.Role ?? row["volunteer role"] ?? row["Volunteer Role"] ?? "";
    const email = (row.email ?? row.Email ?? "").trim().toLowerCase() || undefined;
    const rawPhone = (row.phone ?? row.Phone ?? row["phone number"] ?? "").trim();
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

  // Deduplicate by full name (case-insensitive) — last occurrence wins
  const volSeen = new Map<string, VolunteerRow>();
  for (const v of volunteers) {
    const key = `${v.firstName.toLowerCase().trim()} ${v.lastName.toLowerCase().trim()}`;
    volSeen.set(key, v);
  }
  const deduped = Array.from(volSeen.values());

  // Clear existing volunteer pre-registrations and replace
  await db.delete(volunteerPreRegistrationsTable);

  await db.insert(volunteerPreRegistrationsTable).values(
    deduped.map(v => ({
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email ?? null,
      phone: v.phone ?? null,
      roleName: v.roleName,
    }))
  );

  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(volunteerPreRegistrationsTable);

  const duplicatesRemoved = volunteers.length - deduped.length;

  res.json({
    inserted: deduped.length,
    skipped: invalid.length,
    duplicatesRemoved,
    invalidRows: invalid,
    totalInDatabase: Number(total[0].count),
  });
});

router.get("/admin/volunteers/count", requireAdminAuth, async (_req, res) => {
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(volunteerPreRegistrationsTable);
  res.json({ count: Number(total[0].count) });
});

export default router;
