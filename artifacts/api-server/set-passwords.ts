import bcrypt from "bcryptjs";
import pg from "pg";
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const icuHash = await bcrypt.hash(process.env.ICU_ADMIN_PASSWORD!, 12);
  const platformHash = await bcrypt.hash(process.env.PLATFORM_ADMIN_PASSWORD!, 12);
  const r1 = await pool.query(
    `UPDATE users SET password_hash = $1, password_set = true WHERE email = 'safety@indivisiblecherokeeunited.com' RETURNING id, email, role, password_set`,
    [icuHash]
  );
  console.log("ICU admin:", JSON.stringify(r1.rows[0]));
  const r2 = await pool.query(
    `INSERT INTO users (name, email, role, password_hash, password_set) VALUES ('Platform Admin', 'admin@opscheck.in', 'superadmin', $1, true) ON CONFLICT (email) DO UPDATE SET password_hash = $1, password_set = true RETURNING id, email, role, password_set`,
    [platformHash]
  );
  console.log("Platform admin:", JSON.stringify(r2.rows[0]));
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
