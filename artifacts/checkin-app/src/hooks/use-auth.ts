import { useState, useEffect } from "react";

export type UserRole = "superadmin" | "org_contact" | "event_manager";

export interface AuthUser {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
  orgId: number | null;
  eventId: number | null;
  eventSlug: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  return fetch(path, { credentials: "include", ...opts });
}

export async function authLogin(email: string, password: string) {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, data: await res.json() };
}

export async function authSetPassword(email: string, password: string) {
  const res = await apiFetch("/api/auth/set-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, data: await res.json() };
}

export async function authLogout() {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export function redirectByRole(user: AuthUser, setLocation: (to: string) => void) {
  if (user.role === "superadmin") {
    setLocation("/superadmin");
  } else if (user.role === "org_contact") {
    setLocation("/org");
  } else if (user.role === "event_manager") {
    setLocation(user.eventSlug ? `/${user.eventSlug}/admin` : "/");
  }
}

export function useAuth(): AuthState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  const refetch = async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const { user } = await res.json();
        setState({ user, loading: false });
      } else {
        setState({ user: null, loading: false });
      }
    } catch {
      setState({ user: null, loading: false });
    }
  };

  useEffect(() => { void refetch(); }, []);

  return { ...state, refetch };
}
