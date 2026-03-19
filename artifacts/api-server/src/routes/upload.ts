import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { preRegistrationsTable } from "@workspace/db/schema";
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

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    res.status(400).json({ error: "No valid rows found in CSV. Ensure columns include email, first name, and last name." });
    return;
  }

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

export default router;
