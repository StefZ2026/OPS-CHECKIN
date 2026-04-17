import { eventApiBase, getEventSlug } from "@/lib/event-slug";

const TOKEN_KEY = `admin-token:${getEventSlug()}`;

export function getAdminToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function loginAdmin(password: string): Promise<string> {
  const res = await fetch(`${eventApiBase()}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Invalid password");
  const data = (await res.json()) as { token: string };
  return data.token;
}
