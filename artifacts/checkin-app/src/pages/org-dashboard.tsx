import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Calendar, Users, ChevronRight, Plus, ChevronDown, ChevronUp, Hash, Settings, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useAuth, authLogout, type AuthUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import SiteShell from "@/components/SiteShell";

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
  logoUrl: string | null;
}

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
}

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
      const res = await fetch("/api/orgs/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name, slug, eventDate: eventDate || null, roles }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to create event");
      }
      const event = await res.json() as OrgEvent;
      onCreated(event);
      setOpen(false);
      setName(""); setSlug(""); setEventDate("");
      toast({ title: "Event created", description: `${event.name} is ready.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 font-display text-lg text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-5 h-5" />
        Create Event
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <Card className="mt-4 border-2 border-primary">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1">Event Name</label>
                <Input
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="No Kings 4"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> Event Code (URL slug)
                </label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="no-kings-4"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Attendees use this code to check in: opscheckin.com/{slug || "event-code"}</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1">Event Date (optional)</label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2">Volunteer Roles</label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_ROLES.map((r) => (
                    <button
                      key={r.roleKey}
                      type="button"
                      onClick={() => toggleRole(r.roleKey)}
                      className={`text-xs font-bold px-3 py-1.5 border-2 rounded-lg transition-colors ${
                        selectedRoles.has(r.roleKey)
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-foreground border-foreground/30 hover:border-foreground"
                      }`}
                    >
                      {r.displayName}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
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

export default function OrgDashboard({ currentUser, onLogout }: Props) {
  const [, setLocation] = useLocation();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const orgId = currentUser.orgId;

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

  const handleEventCreated = (event: OrgEvent) => {
    setEvents((prev) => [event, ...prev]);
  };

  return (
    <SiteShell>
      <div className="bg-gray-50 min-h-full">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

          <div className="flex items-start gap-5">
            {org?.logoUrl ? (
              <img
                src={org.logoUrl}
                alt={org.name}
                className="w-20 h-20 rounded-2xl object-contain border-4 border-foreground shadow-brutal flex-shrink-0 bg-white"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl border-4 border-foreground shadow-brutal bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-4xl mb-1">{org?.name ?? "Your Organization"}</h2>
              <p className="text-muted-foreground text-sm font-medium">{currentUser.name}</p>
            </div>
            <Link href="/org/settings">
              <Button variant="outline" size="sm" className="flex-shrink-0">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>

          <div className="h-px bg-foreground/10" />

          <div>
            <h3 className="font-display text-2xl mb-4">Events</h3>

            {loading && <p className="text-muted-foreground">Loading events…</p>}
            {error && <p className="text-red-600 font-medium">{error}</p>}

            {orgId && (
              <div className="border-4 border-foreground rounded-2xl p-6 bg-white shadow-brutal mb-6">
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
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
