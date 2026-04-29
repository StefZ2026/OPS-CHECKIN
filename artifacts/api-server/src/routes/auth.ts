import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { db } from "@workspace/db";
import { usersTable, eventsTable } from "@workspace/db/schema";
import { eq, or, ilike } from "drizzle-orm";

const router = Router();
router.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET!;
const COOKIE_NAME = "auth_token";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
  orgId: number | null;
  eventId: number | null;
  eventSlug: string | null;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

async function buildPayload(user: typeof usersTable.$inferSelect): Promise<AuthPayload> {
  let eventSlug: string | null = null;
  if (user.eventId) {
    const rows = await db.select({ slug: eventsTable.slug }).from(eventsTable).where(eq(eventsTable.id, user.eventId)).limit(1);
    eventSlug = rows[0]?.slug ?? null;
  }
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId,
    eventId: user.eventId,
    eventSlug,
  };
}

export function requireUserAuth(req: Request, res: Response, next: () => void): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "Session expired" }); return; }
  res.locals.user = payload;
  next();
}

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Username/email and password are required" });
    return;
  }

  const identifier = email.trim();
  const rows = await db
    .select()
    .from(usersTable)
    .where(or(
      ilike(usersTable.email, identifier.toLowerCase()),
      ilike(usersTable.username, identifier)
    ))
    .limit(1);

  const user = rows[0];
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // First-time login: password not set yet
  if (!user.passwordSet || !user.passwordHash) {
    res.status(200).json({ firstLogin: true, email: user.email, name: user.name });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const payload = await buildPayload(user);
  res.cookie(COOKIE_NAME, signToken(payload), COOKIE_OPTS);
  res.json({ ok: true, user: payload });
});

// POST /api/auth/set-password  (first-time password setup)
router.post("/set-password", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password || password.length < 8) {
    res.status(400).json({ error: "Valid email and password (min 8 chars) are required" });
    return;
  }

  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .limit(1);

  const user = rows[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.passwordSet) {
    res.status(400).json({ error: "Password already set. Use login instead." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await db
    .update(usersTable)
    .set({ passwordHash, passwordSet: true })
    .where(eq(usersTable.id, user.id))
    .returning();

  const payload = await buildPayload(updated[0]);
  res.cookie(COOKIE_NAME, signToken(payload), COOKIE_OPTS);
  res.json({ ok: true, user: payload });
});

// GET /api/auth/me
router.get("/me", (req: Request, res: Response): void => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "Session expired" }); return; }
  res.json({ user: payload });
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

export default router;
