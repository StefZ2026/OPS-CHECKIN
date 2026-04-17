import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Lock, Eye, EyeOff, Plus, ChevronDown, ChevronUp, LogOut,
  Calendar, Key, Hash, Zap, Users, Trash2, CheckCircle2, X, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const SUPERADMIN_TOKEN_KEY = "superadmin-token";

function getSuperadminToken(): string | null {
  return sessionStorage.getItem(SUPERADMIN_TOKEN_KEY);
}
function setSuperadminToken(t: string) {
  sessionStorage.setItem(SUPERADMIN_TOKEN_KEY, t);
}
function clearSuperadminToken() {
  sessionStorage.removeItem(SUPERADMIN_TOKEN_KEY);
}

async function loginSuperadmin(password: string): Promise<string> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Invalid password");
  const data = (await res.json()) as { token: string };
  return data.token;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type EventRole = { id: number; roleKey: string; displayName: string; sortOrder: number };
type EventRecord = {
  id: number;
  name: string;
  slug: string;
  eventDate: string | null;
  giveawayEnabled: boolean;
  mobilizeEventId: string | null;
  isActive: boolean;
  createdAt: string;
  checkedInCount: number;
  org: { id: number; name: string | null; slug: string | null };
  roles: EventRole[];
};

type NewRoleRow = { roleKey: string; displayName: string };

// ── Login gate ─────────────────────────────────────────────────────────────────

function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await loginSuperadmin(password);
      setSuperadminToken(token);
      onLogin();
    } catch {
      setError("Incorrect password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-4 border-primary shadow-brutal-lg">
        <CardContent className="p-10">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 bg-primary text-white rounded-xl border-4 border-foreground shadow-brutal">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h1 className="font-display text-3xl leading-tight">Platform Admin</h1>
              <p className="text-muted-foreground font-medium">Event Management</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="font-display text-lg uppercase tracking-wider block mb-2">Admin Password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter platform admin password"
                  autoFocus
                  className="w-full border-4 border-foreground rounded-lg px-4 py-3 pr-14 text-lg font-medium focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShow((p) => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-destructive font-bold text-base border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" isLoading={loading}>
              {loading ? "Checking..." : "Unlock Event Manager"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Create Event Form ──────────────────────────────────────────────────────────

type CreateEventFormProps = {
  onCreated: () => void;
};

function CreateEventForm({ onCreated }: CreateEventFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [mobilizeEventId, setMobilizeEventId] = useState("");
  const [giveawayEnabled, setGiveawayEnabled] = useState(false);
  const [roles, setRoles] = useState<NewRoleRow[]>([
    { roleKey: "", displayName: "" },
  ]);

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === autoSlug(name)) setSlug(autoSlug(v));
  };

  const addRole = () => setRoles((r) => [...r, { roleKey: "", displayName: "" }]);
  const removeRole = (i: number) => setRoles((r) => r.filter((_, idx) => idx !== i));
  const updateRole = (i: number, field: keyof NewRoleRow, value: string) =>
    setRoles((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const handleRoleDisplayNameChange = (i: number, displayName: string) => {
    const roleKey = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    setRoles((r) =>
      r.map((row, idx) =>
        idx === i ? { displayName, roleKey: row.roleKey || roleKey } : row
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validRoles = roles.filter((r) => r.roleKey.trim() && r.displayName.trim());

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      eventDate: eventDate || undefined,
      adminPassword: adminPassword.trim() || undefined,
      mobilizeEventId: mobilizeEventId.trim() || undefined,
      giveawayEnabled,
      roles: validRoles,
    };

    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSuperadminToken() ?? ""}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { event?: EventRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create event");

      toast({ title: "Event created!", description: `"${data.event!.name}" is ready at /api/events/${data.event!.slug}/...` });
      onCreated();

      setName(""); setSlug(""); setEventDate(""); setAdminPassword("");
      setMobilizeEventId(""); setGiveawayEnabled(false);
      setRoles([{ roleKey: "", displayName: "" }]);
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
        className="flex items-center gap-2 font-display text-xl text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-6 h-6" />
        Create New Event
        {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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
                    placeholder="Building Bridges Cafe — Session 2"
                    required
                  />
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    Slug <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm select-none">
                      <Hash className="w-4 h-4 inline" />
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="bb-cafe-2"
                      className="pl-8 font-mono"
                      required
                      pattern="[a-z0-9-]+"
                      title="Lowercase letters, numbers, and hyphens only"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Used in the URL: /api/events/<strong>{slug || "slug"}</strong>/...</p>
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
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    <Key className="w-4 h-4 inline mr-1" />Admin Password
                  </label>
                  <Input
                    type="text"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Event-specific admin password"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Used by event admins to log in at /admin</p>
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    Mobilize Event ID
                  </label>
                  <Input
                    value={mobilizeEventId}
                    onChange={(e) => setMobilizeEventId(e.target.value)}
                    placeholder="Leave blank if not using Mobilize"
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setGiveawayEnabled((v) => !v)}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full border-4 border-foreground transition-colors ${giveawayEnabled ? "bg-primary" : "bg-gray-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white border-2 border-foreground transform transition-transform ${giveawayEnabled ? "translate-x-7" : "translate-x-1"}`} />
                  </button>
                  <div>
                    <p className="font-display text-sm uppercase tracking-wider">
                      <Zap className="w-4 h-4 inline mr-1" />Giveaway
                    </p>
                    <p className="text-xs text-muted-foreground">{giveawayEnabled ? "Enabled" : "Disabled"}</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-display text-sm uppercase tracking-wider">
                    <Users className="w-4 h-4 inline mr-1" />Volunteer Roles
                  </label>
                  <button
                    type="button"
                    onClick={addRole}
                    className="text-primary text-sm font-bold flex items-center gap-1 hover:text-primary/80"
                  >
                    <Plus className="w-4 h-4" /> Add Role
                  </button>
                </div>
                <div className="space-y-2">
                  {roles.map((role, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <Input
                          value={role.displayName}
                          onChange={(e) => handleRoleDisplayNameChange(i, e.target.value)}
                          placeholder="Display name (e.g. Safety Marshal)"
                          className="text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          value={role.roleKey}
                          onChange={(e) => updateRole(i, "roleKey", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                          placeholder="key (e.g. safety_marshal)"
                          className="text-sm font-mono"
                        />
                      </div>
                      {roles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRole(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Rows with empty display name or key will be skipped.</p>
                </div>
              </div>

              {error && (
                <p className="text-destructive font-bold text-sm border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" isLoading={loading} className="flex-1">
                  {loading ? "Creating..." : "Create Event"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Edit Event Form ────────────────────────────────────────────────────────────

type EditEventFormProps = {
  event: EventRecord;
  onSaved: (event: EventRecord) => void;
  onCancel: () => void;
};

function EditEventForm({ event, onSaved, onCancel }: EditEventFormProps) {
  const [name, setName] = useState(event.name);
  const [eventDate, setEventDate] = useState(
    event.eventDate ? event.eventDate.slice(0, 10) : ""
  );
  const [adminPassword, setAdminPassword] = useState("");
  const [mobilizeEventId, setMobilizeEventId] = useState(event.mobilizeEventId ?? "");
  const [giveawayEnabled, setGiveawayEnabled] = useState(event.giveawayEnabled);
  const [isActive, setIsActive] = useState(event.isActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Event name is required"); return; }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      eventDate: eventDate || null,
      mobilizeEventId: mobilizeEventId.trim() || null,
      giveawayEnabled,
      isActive,
    };
    if (adminPassword.trim()) {
      payload.adminPassword = adminPassword.trim();
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSuperadminToken() ?? ""}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { event?: EventRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update event");
      toast({ title: "Event updated", description: `"${data.event!.name}" has been saved.` });
      onSaved(data.event!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t-2 border-primary/30 space-y-4">
      <p className="font-display text-sm uppercase tracking-wider text-primary flex items-center gap-1">
        <Pencil className="w-4 h-4" /> Edit Event
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="font-display text-xs uppercase tracking-wider block mb-1">
            Event Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
            required
          />
        </div>

        <div>
          <label className="font-display text-xs uppercase tracking-wider block mb-1">
            <Calendar className="w-3 h-3 inline mr-1" />Event Date
          </label>
          <Input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>

        <div>
          <label className="font-display text-xs uppercase tracking-wider block mb-1">
            <Key className="w-3 h-3 inline mr-1" />Admin Password
          </label>
          <Input
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Leave blank to keep current"
          />
          <p className="text-xs text-muted-foreground mt-1">Only set if you want to change it</p>
        </div>

        <div>
          <label className="font-display text-xs uppercase tracking-wider block mb-1">
            Mobilize Event ID
          </label>
          <Input
            value={mobilizeEventId}
            onChange={(e) => setMobilizeEventId(e.target.value)}
            placeholder="Leave blank to clear"
          />
        </div>

        <div className="flex items-start gap-6 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGiveawayEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-12 items-center rounded-full border-4 border-foreground transition-colors ${giveawayEnabled ? "bg-primary" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white border-2 border-foreground transform transition-transform ${giveawayEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div>
              <p className="font-display text-xs uppercase tracking-wider"><Zap className="w-3 h-3 inline mr-0.5" />Giveaway</p>
              <p className="text-xs text-muted-foreground">{giveawayEnabled ? "On" : "Off"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-6 w-12 items-center rounded-full border-4 border-foreground transition-colors ${isActive ? "bg-green-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white border-2 border-foreground transform transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div>
              <p className="font-display text-xs uppercase tracking-wider">Active</p>
              <p className="text-xs text-muted-foreground">{isActive ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-destructive font-bold text-sm border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" isLoading={loading} size="sm">
          {loading ? "Saving..." : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────────

function EventCard({ event, onUpdated }: { event: EventRecord; onUpdated: (event: EventRecord) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleSaved = (updated: EventRecord) => {
    onUpdated(updated);
    setEditing(false);
  };

  return (
    <Card className="border-2 border-foreground">
      <CardContent className="p-5">
        <button
          className="w-full text-left"
          onClick={() => { if (!editing) setExpanded((v) => !v); }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-lg leading-tight">{event.name}</h3>
                {event.isActive ? (
                  <span className="text-xs font-bold bg-green-100 text-green-800 border border-green-600 rounded-full px-2 py-0.5">Active</span>
                ) : (
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 border border-gray-400 rounded-full px-2 py-0.5">Inactive</span>
                )}
                {event.giveawayEnabled && (
                  <span className="text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-600 rounded-full px-2 py-0.5">
                    <Zap className="w-3 h-3 inline" /> Giveaway
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="font-mono text-sm text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                  /api/events/{event.slug}/
                </span>
                {event.eventDate && (
                  <span className="text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    {format(new Date(event.eventDate), "MMM d, yyyy")}
                  </span>
                )}
                <span className="text-sm font-bold text-foreground">
                  <Users className="w-4 h-4 inline mr-1" />
                  {event.checkedInCount} checked in
                </span>
              </div>
            </div>
            {expanded ? <ChevronUp className="w-5 h-5 flex-shrink-0 mt-1 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 flex-shrink-0 mt-1 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-4 border-t-2 border-foreground/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="font-bold text-muted-foreground uppercase tracking-wider text-xs">Org</span>
                <p className="font-medium">{event.org.name ?? "—"} <span className="text-muted-foreground">({event.org.slug})</span></p>
              </div>
              <div>
                <span className="font-bold text-muted-foreground uppercase tracking-wider text-xs">Mobilize Event ID</span>
                <p className="font-mono font-medium">{event.mobilizeEventId ?? <span className="text-muted-foreground italic">none</span>}</p>
              </div>
              <div>
                <span className="font-bold text-muted-foreground uppercase tracking-wider text-xs">Created</span>
                <p className="font-medium">{format(new Date(event.createdAt), "MMM d, yyyy")}</p>
              </div>
            </div>

            {event.roles.length > 0 && (
              <div>
                <span className="font-bold text-muted-foreground uppercase tracking-wider text-xs block mb-2">
                  <Users className="w-4 h-4 inline mr-1" />Volunteer Roles ({event.roles.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {event.roles.map((r) => (
                    <span key={r.id} className="text-sm border-2 border-foreground rounded-lg px-3 py-1 font-medium bg-white">
                      {r.displayName}
                      <span className="font-mono text-xs text-muted-foreground ml-2">({r.roleKey})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <a
                href={`/${event.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-4 border-foreground bg-white hover:bg-secondary/30 font-display text-base transition-colors shadow-brutal"
              >
                <Users className="w-5 h-5" /> Open Check-In
              </a>
              <a
                href={`/${event.slug}/admin`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-4 border-primary bg-primary text-white hover:bg-primary/90 font-display text-base transition-colors shadow-brutal"
              >
                <Lock className="w-5 h-5" /> Open Admin
              </a>
            </div>

            <div className="p-3 bg-gray-50 border-2 border-gray-200 rounded-lg">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Check-in URL</p>
              <p className="font-mono text-xs text-gray-700 break-all">{window.location.origin}/{event.slug}</p>
            </div>

            {!editing && (
              <div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  <Pencil className="w-4 h-4" /> Edit Event
                </button>
              </div>
            )}

            {editing && (
              <EditEventForm
                event={event}
                onSaved={handleSaved}
                onCancel={() => setEditing(false)}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SuperadminPage() {
  const [authed, setAuthed] = useState(!!getSuperadminToken());
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const { toast } = useToast();

  const fetchEvents = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/superadmin/events", {
        headers: { Authorization: `Bearer ${getSuperadminToken() ?? ""}` },
      });
      if (res.status === 401) {
        clearSuperadminToken();
        setAuthed(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load events");
      const data = (await res.json()) as { events: EventRecord[] };
      setEvents(data.events);
    } catch {
      setLoadError("Could not load events. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) fetchEvents();
  }, [authed]);

  const handleLogout = () => {
    clearSuperadminToken();
    setAuthed(false);
    setEvents([]);
  };

  const handleEventCreated = () => {
    void fetchEvents();
  };

  const handleEventUpdated = (_updated: EventRecord) => {
    void fetchEvents();
  };

  if (!authed) {
    return <LoginGate onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-foreground text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Platform Admin</h1>
          <p className="text-white/70 text-sm font-medium">ICU Event Management</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-bold"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <CreateEventForm onCreated={handleEventCreated} />

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl">All Events</h2>
            <button
              onClick={fetchEvents}
              className="text-sm text-muted-foreground hover:text-foreground font-bold transition-colors"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="text-center text-muted-foreground py-12 font-medium">Loading events...</div>
          )}
          {loadError && (
            <div className="p-4 bg-red-50 border-2 border-destructive rounded-xl text-destructive font-bold text-sm">
              {loadError}
            </div>
          )}

          {!loading && !loadError && events.length === 0 && (
            <div className="text-center text-muted-foreground py-12 font-medium">No events yet. Create one above.</div>
          )}

          <div className="space-y-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} onUpdated={handleEventUpdated} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
