import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Calendar, Users, ChevronRight, LogOut, Shield, Plus, ChevronDown, ChevronUp, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useAuth, authLogout, type AuthUser } from "@/hooks/use-auth";
import Logo from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_ROLES = [
  { roleKey: "safety_marshal", displayName: "Safety Marshal" },
  { roleKey: "medic", displayName: "Medic" },
  { roleKey: "de_escalator", displayName: "De-Escalator" },
  { roleKey: "chant_lead", displayName: "Chant Lead" },
];

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

// ── Create Event Form ────────────────────────────────────────────────────────

function CreateEventForm({ orgId, onCreated }: { orgId: number; onCreated: (event: OrgEvent) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(DEFAULT_ROLES.map((r) => r.roleKey))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === autoSlug(name)) setSlug(autoSlug(v));
  };

  const toggleRole = (key: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !slug.trim()) { setError("Name and slug are required"); return; }

    const roles = DEFAULT_ROLES.filter((r) => selectedRoles.has(r.roleKey));

    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/events`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          eventDate: eventDate || undefined,
          roles,
        }),
      });
      const data = await res.json() as { event?: OrgEvent; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create event");

      toast({ title: "Event created!", description: `"${data.event!.name}" is live.` });
      onCreated(data.event!);
      setName(""); setSlug(""); setEventDate("");
      setSelectedRoles(new Set(DEFAULT_ROLES.map((r) => r.roleKey)));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 font-display text-lg text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-5 h-5" />
        Create Event
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <Card className="border-4 border-primary">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    Event Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Spring Rally 2026"
                    required
                  />
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    Slug <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Hash className="w-4 h-4" />
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="spring-rally-2026"
                      className="pl-8 font-mono"
                      required
                      pattern="[a-z0-9-]+"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Used in the URL: /{slug || "slug"}/check-in</p>
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    <Calendar className="w-4 h-4 inline mr-1" />Event Date
                  </label>
                  <Input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="font-display text-sm uppercase tracking-wider block mb-2">
                  <Users className="w-4 h-4 inline mr-1" />Volunteer Roles
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_ROLES.map((role) => (
                    <button
                      key={role.roleKey}
                      type="button"
                      onClick={() => toggleRole(role.roleKey)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-left text-sm font-medium transition-all ${
                        selectedRoles.has(role.roleKey)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-foreground/20 bg-white text-muted-foreground hover:border-foreground/50"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedRoles.has(role.roleKey) ? "border-primary bg-primary" : "border-foreground/30"
                      }`}>
                        {selectedRoles.has(role.roleKey) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                            <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {role.displayName}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-destructive font-bold text-sm border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <Button type="submit" isLoading={loading} className="flex-1">
                  {loading ? "Creating..." : "Create Event"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Org Dashboard ─────────────────────────────────────────────────────────────

export default function OrgDashboard({ currentUser, onLogout }: Props) {
  const [, setLocation] = useLocation();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useParams<{ orgId?: string }>();
  const isSuperadmin = currentUser.role === "superadmin";
  const urlOrgId = isSuperadmin
    ? (parseInt(params.orgId ?? "") || null)
    : null;
  const orgId = urlOrgId ?? currentUser.orgId;

  const loadEvents = async () => {
    try {
      const [orgRes, eventsRes] = await Promise.all([
        fetch(`/api/orgs/${orgId}`, { credentials: "include" }),
        fetch(`/api/orgs/${orgId}/events`, { credentials: "include" }),
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

  useEffect(() => { void loadEvents(); }, [orgId]);

  const handleLogout = async () => {
    await authLogout();
    onLogout();
    setLocation("/login");
  };

  const handleEventCreated = (event: OrgEvent) => {
    setEvents((prev) => [event, ...prev]);
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
              <a href={`${import.meta.env.BASE_URL}superadmin`}>
                <Button size="sm" variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white text-xs">
                  <Shield className="w-3 h-3 mr-1" /> Admin
                </Button>
              </a>
            )}
            <Button size="sm" variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl">Events</h2>
        </div>

        {loading && <p className="text-muted-foreground">Loading events…</p>}
        {error && <p className="text-red-600 font-medium">{error}</p>}

        {/* Create Event form */}
        {orgId && (
          <div className="border-4 border-foreground rounded-2xl p-6 bg-white shadow-brutal">
            <CreateEventForm orgId={orgId} onCreated={handleEventCreated} />
          </div>
        )}

        {!loading && events.length === 0 && (
          <p className="text-muted-foreground italic">No events yet. Create your first one above.</p>
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
