import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Calendar, Users, ChevronRight, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { useAuth, authLogout, type AuthUser } from "@/hooks/use-auth";
import Logo from "@/components/Logo";

interface OrgEvent {
  id: number;
  name: string;
  slug: string;
  eventDate: string | null;
  isActive: boolean;
  checkedInCount: number;
}

interface OrgInfo {
  id: number;
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
}

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
}

export default function OrgDashboard({ currentUser, onLogout }: Props) {
  const [, setLocation] = useLocation();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isSuperadmin = currentUser.role === "superadmin";
  const orgId = currentUser.orgId;

  useEffect(() => {
    const load = async () => {
      try {
        const token = document.cookie.match(/auth_token=([^;]+)/)?.[1];
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        const [orgRes, eventsRes] = await Promise.all([
          fetch(`/api/orgs/${orgId}`, { credentials: "include", headers }),
          fetch(`/api/orgs/${orgId}/events`, { credentials: "include", headers }),
        ]);

        if (orgRes.ok) setOrg(await orgRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
        else setError("Failed to load events");
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [orgId]);

  const handleLogout = async () => {
    await authLogout();
    onLogout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-foreground text-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="w-9 h-9" />
            <div>
              <h1 className="font-display text-2xl">{org?.name ?? "Organization"}</h1>
              <p className="text-gray-400 text-sm">{currentUser.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperadmin && (
              <Link href="/superadmin">
                <Button size="sm" variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white text-xs">
                  <Shield className="w-3 h-3 mr-1" /> Admin
                </Button>
              </Link>
            )}
            <Button size="sm" variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <h2 className="font-display text-3xl">Events</h2>

        {loading && <p className="text-muted-foreground">Loading events…</p>}
        {error && <p className="text-red-600 font-medium">{error}</p>}

        {!loading && events.length === 0 && (
          <p className="text-muted-foreground italic">No events yet for this organization.</p>
        )}

        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id} className="border-2 border-foreground hover:shadow-brutal transition-shadow">
              <CardContent className="p-5">
                <Link href={`/${event.slug}/admin`}>
                  <button className="w-full text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-display text-xl">{event.name}</h3>
                          <span className={`text-xs font-bold rounded-full px-2 py-0.5 border ${event.isActive ? "bg-green-100 text-green-800 border-green-600" : "bg-gray-100 text-gray-600 border-gray-400"}`}>
                            {event.isActive ? "Active" : "Completed"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {event.eventDate && (
                            <span><Calendar className="w-4 h-4 inline mr-1" />{format(new Date(event.eventDate), "MMM d, yyyy")}</span>
                          )}
                          <span><Users className="w-4 h-4 inline mr-1" />{event.checkedInCount} checked in</span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
