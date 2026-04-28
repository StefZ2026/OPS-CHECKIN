import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Lock, Plus, ChevronDown, ChevronUp, LogOut, RefreshCw,
  Calendar, Key, Hash, Zap, Users, Trash2, CheckCircle2, X, Pencil, QrCode, Download,
  Mail, UserPlus, ShieldCheck, Building2, ExternalLink,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth, authLogout } from "@/hooks/use-auth";

// ── Types ──────────────────────────────────────────────────────────────────────

type EventRole = { id: number; roleKey: string; displayName: string; sortOrder: number };
type EventRecord = {
  id: number;
  name: string;
  slug: string;
  eventDate: string | null;
  eventDates: string | null;
  giveawayEnabled: boolean;
  smsReentryEnabled: boolean;
  mobilizeEventId: string | null;
  isActive: boolean;
  createdAt: string;
  checkedInCount: number;
  volunteerCount: number;
  attendeeCount: number;
  org: { id: number; name: string | null; slug: string | null };
  roles: EventRole[];
};

type NewRoleRow = { roleKey: string; displayName: string };

type OrgRecord = {
  id: number;
  name: string;
  slug: string;
  eventCount: number;
  createdAt: string;
};

type UserRecord = {
  id: number;
  name: string;
  email: string;
  role: "org_contact" | "event_manager";
  orgId: number | null;
  eventId: number | null;
  passwordSet: boolean;
  createdAt: string;
  org: { id: number; name: string; slug: string } | null;
  event: { id: number; name: string; slug: string } | null;
};

// ── Create Event Form ──────────────────────────────────────────────────────────

type CreateEventFormProps = {
  orgSlug: string;
  orgName: string;
  orgId: number;
  orgUsers: UserRecord[];
  onCreated: () => void;
};

function CreateEventForm({ orgSlug, orgName, orgId: _orgId, orgUsers, onCreated }: CreateEventFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [extraDates, setExtraDates] = useState<string[]>([""]);
  const [adminPassword, setAdminPassword] = useState("");
  const [mobilizeEventId, setMobilizeEventId] = useState("");
  const [giveawayEnabled, setGiveawayEnabled] = useState(false);
  const [smsReentryEnabled, setSmsReentryEnabled] = useState(false);
  const [managerSelection, setManagerSelection] = useState<ManagerSelection>({ type: "clear" });
  const ALL_ROLES = PREDEFINED_ROLES;

  const [selectedRoleKeys, setSelectedRoleKeys] = useState<Set<string>>(
    new Set(["safety_marshal", "medic", "de_escalator", "chant_lead"])
  );
  const [customRoles, setCustomRoles] = useState<NewRoleRow[]>([]);
  const [customRoleInput, setCustomRoleInput] = useState("");

  const toggleRole = (key: string) =>
    setSelectedRoleKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const addCustomRole = () => {
    const display = customRoleInput.trim();
    if (!display) return;
    const key = display.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (selectedRoleKeys.has(key) || customRoles.some((r) => r.roleKey === key)) return;
    setCustomRoles((prev) => [...prev, { roleKey: key, displayName: display }]);
    setCustomRoleInput("");
  };

  const removeCustomRole = (key: string) =>
    setCustomRoles((prev) => prev.filter((r) => r.roleKey !== key));

  const selectedFromList = ALL_ROLES.filter((r) => selectedRoleKeys.has(r.roleKey));
  const roles = [...selectedFromList, ...customRoles];

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === autoSlug(name)) setSlug(autoSlug(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validRoles = roles.filter((r) => r.roleKey.trim() && r.displayName.trim());

    // Build the dates array for multi-day events
    let builtEventDates: string[] | undefined;
    if (isMultiDay && eventDate) {
      const allDates = [eventDate, ...extraDates.filter((d) => d.trim())];
      if (allDates.length > 1) builtEventDates = allDates;
    }

    const payload: Record<string, unknown> = {
      orgSlug,
      name: name.trim(),
      slug: slug.trim(),
      adminPassword: adminPassword.trim() || undefined,
      mobilizeEventId: mobilizeEventId.trim() || undefined,
      giveawayEnabled,
      smsReentryEnabled,
      roles: validRoles,
    };
    if (builtEventDates) {
      payload.eventDates = builtEventDates;
      payload.eventDate = builtEventDates[0];
    } else {
      payload.eventDate = eventDate || undefined;
    }
    if (managerSelection.type === "existing") payload.eventManagerId = managerSelection.userId;

    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { event?: EventRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create event");

      toast({ title: "Event created!", description: `"${data.event!.name}" is live at /${data.event!.slug}` });
      onCreated();

      setName(""); setSlug(""); setEventDate(""); setAdminPassword("");
      setIsMultiDay(false); setExtraDates([""]);
      setSelectedRoleKeys(new Set(["safety_marshal", "medic", "de_escalator", "chant_lead"]));
      setMobilizeEventId(""); setGiveawayEnabled(false); setSmsReentryEnabled(false);
      setCustomRoles([]); setCustomRoleInput("");
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
        Add Event for {orgName}
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
                  <p className="text-xs text-muted-foreground mt-1">Used in the URL: /<strong>{slug || "slug"}</strong></p>
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-display text-sm uppercase tracking-wider">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      {isMultiDay ? "Event Dates" : "Event Date"}
                    </label>
                    <button
                      type="button"
                      onClick={() => { setIsMultiDay((v) => !v); setExtraDates([""]); }}
                      className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border-2 border-foreground transition-colors ${isMultiDay ? "bg-primary text-white" : "bg-white text-foreground"}`}
                    >
                      Multi-day
                    </button>
                  </div>
                  <Input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    placeholder={isMultiDay ? "Day 1" : ""}
                  />
                  {isMultiDay && (
                    <div className="space-y-2">
                      {extraDates.map((d, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <Input
                            type="date"
                            value={d}
                            onChange={(e) => {
                              const updated = [...extraDates];
                              updated[i] = e.target.value;
                              setExtraDates(updated);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setExtraDates((prev) => prev.filter((_, idx) => idx !== i))}
                            className="p-1 rounded border-2 border-foreground hover:bg-destructive hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setExtraDates((prev) => [...prev, ""])}
                        className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80"
                      >
                        <Plus className="w-3 h-3" /> Add another day
                      </button>
                    </div>
                  )}
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
                <div className="sm:col-span-2 flex flex-col sm:flex-row gap-4 pt-2">
                  <div className="flex items-center gap-3">
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
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSmsReentryEnabled((v) => !v)}
                      className={`relative inline-flex h-7 w-14 items-center rounded-full border-4 border-foreground transition-colors ${smsReentryEnabled ? "bg-primary" : "bg-gray-200"}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white border-2 border-foreground transform transition-transform ${smsReentryEnabled ? "translate-x-7" : "translate-x-1"}`} />
                    </button>
                    <div>
                      <p className="font-display text-sm uppercase tracking-wider">
                        SMS Re-Entry Wristbands
                      </p>
                      <p className="text-xs text-muted-foreground">{smsReentryEnabled ? "On — QR code sent via SMS after Day 1 check-in" : "Off"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-display text-sm uppercase tracking-wider block mb-3">
                  <Users className="w-4 h-4 inline mr-1" />Volunteer Roles
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map((role) => (
                    <button
                      key={role.roleKey}
                      type="button"
                      onClick={() => toggleRole(role.roleKey)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-4 text-left font-bold text-sm transition-all ${
                        selectedRoleKeys.has(role.roleKey)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-foreground/20 bg-white text-muted-foreground hover:border-foreground/60"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedRoleKeys.has(role.roleKey) ? "border-primary bg-primary" : "border-foreground/30"
                      }`}>
                        {selectedRoleKeys.has(role.roleKey) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </span>
                      {role.displayName}
                    </button>
                  ))}
                </div>
              </div>

              <EventManagerPicker
                orgUsers={orgUsers}
                currentManager={null}
                onChange={setManagerSelection}
              />

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

// ── Create User Form ───────────────────────────────────────────────────────────

type CreateUserFormProps = {
  orgs: OrgRecord[];
  events: EventRecord[];
  onCreated: () => void;
};

function CreateUserForm({ orgs, events, onCreated }: CreateUserFormProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"org_contact" | "event_manager">("org_contact");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState<number | "">("");
  const [eventId, setEventId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) { setError("Name and email are required"); return; }
    if (role === "org_contact" && !orgId) { setError("Select an organization"); return; }
    if (role === "event_manager" && !eventId) { setError("Select an event"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          orgId: role === "org_contact" ? Number(orgId) : undefined,
          eventId: role === "event_manager" ? Number(eventId) : undefined,
        }),
      });
      const data = await res.json() as { user?: UserRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");

      toast({
        title: "User created",
        description: `${name} will set their password on first login to ${email}`,
      });
      onCreated();
      setName(""); setEmail(""); setOrgId(""); setEventId("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
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
        <UserPlus className="w-5 h-5" />
        Add User
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <Card className="border-4 border-primary">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Role toggle */}
              <div>
                <label className="font-display text-sm uppercase tracking-wider block mb-2">Role</label>
                <div className="flex gap-3">
                  {(["org_contact", "event_manager"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-4 font-bold text-sm transition-all ${
                        role === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-foreground/20 bg-white text-muted-foreground hover:border-foreground/60"
                      }`}
                    >
                      {r === "org_contact" ? <Building2 className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      {r === "org_contact" ? "Org Contact" : "Event Manager"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {role === "org_contact"
                    ? "Can log in, see their org's events, and create new events."
                    : "Can log in and manage a single event's admin page."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />Email <span className="text-destructive">*</span>
                  </label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@org.com" required />
                </div>

                {role === "org_contact" && (
                  <div className="sm:col-span-2">
                    <label className="font-display text-sm uppercase tracking-wider block mb-1">
                      Organization <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={orgId}
                      onChange={(e) => setOrgId(e.target.value ? Number(e.target.value) : "")}
                      required
                      className="w-full border-4 border-foreground rounded-lg px-4 py-2 font-medium text-sm focus:outline-none focus:border-primary bg-white"
                    >
                      <option value="">— Select organization —</option>
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {role === "event_manager" && (
                  <div className="sm:col-span-2">
                    <label className="font-display text-sm uppercase tracking-wider block mb-1">
                      Event <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : "")}
                      required
                      className="w-full border-4 border-foreground rounded-lg px-4 py-2 font-medium text-sm focus:outline-none focus:border-primary bg-white"
                    >
                      <option value="">— Select event —</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>{ev.name} ({ev.org.slug})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-destructive font-bold text-sm border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">
                  {error}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                The user will set their own password on first login — no password is sent.
              </p>

              <div className="flex gap-3 pt-2">
                <Button type="submit" isLoading={loading} className="flex-1">
                  {loading ? "Creating..." : "Create User"}
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

// ── Event Manager Picker ───────────────────────────────────────────────────────

type ManagerMode = "keep" | "existing" | "clear";
export type ManagerSelection =
  | { type: "keep" }
  | { type: "clear" }
  | { type: "existing"; userId: number };

function EventManagerPicker({
  orgUsers,
  currentManager,
  onChange,
}: {
  orgUsers: UserRecord[];
  currentManager?: UserRecord | null;
  onChange: (sel: ManagerSelection) => void;
}) {
  const [mode, setMode] = useState<ManagerMode>(currentManager ? "keep" : "clear");
  const [selectedUserId, setSelectedUserId] = useState<number | "">(currentManager?.id ?? "");

  const switchMode = (m: ManagerMode) => {
    setMode(m);
    if (m === "keep") onChange({ type: "keep" });
    else if (m === "clear") onChange({ type: "clear" });
    else if (m === "existing" && selectedUserId) onChange({ type: "existing", userId: Number(selectedUserId) });
  };

  const tabClass = (active: boolean, danger = false) =>
    `px-3 py-1 rounded-full border-2 font-bold text-xs transition-colors ${
      active
        ? danger ? "bg-red-600 text-white border-red-600" : "bg-foreground text-white border-foreground"
        : "border-foreground/30 hover:border-foreground"
    }`;

  return (
    <div className="space-y-3 pt-2 border-t-2 border-foreground/10">
      <label className="font-display text-xs uppercase tracking-wider block">
        <Key className="w-3 h-3 inline mr-1" />Event Manager
      </label>

      {currentManager && mode === "keep" && (
        <div className="flex items-center gap-2 text-sm bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex-wrap">
          <span className="font-semibold">{currentManager.name}</span>
          <span className="text-muted-foreground text-xs">{currentManager.email}</span>
          <span className={`text-xs font-bold border rounded-full px-2 py-0.5 ml-auto ${currentManager.passwordSet ? "bg-green-100 text-green-800 border-green-400" : "bg-yellow-100 text-yellow-800 border-yellow-400"}`}>
            {currentManager.passwordSet ? "Active" : "Pending first login"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {currentManager && (
          <button type="button" onClick={() => switchMode("keep")} className={tabClass(mode === "keep")}>Keep current</button>
        )}
        <button type="button" onClick={() => switchMode("existing")} className={tabClass(mode === "existing")} disabled={orgUsers.length === 0}>
          Select org user
        </button>
        {currentManager && (
          <button type="button" onClick={() => switchMode("clear")} className={tabClass(mode === "clear", true)}>Remove</button>
        )}
      </div>

      {mode === "existing" && (
        orgUsers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No users in this organization yet. Add a user to this org first, then assign them as event manager.</p>
        ) : (
          <select
            value={selectedUserId}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : "";
              setSelectedUserId(v);
              if (v) onChange({ type: "existing", userId: Number(v) });
            }}
            className="w-full border-4 border-foreground rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-primary bg-white"
          >
            <option value="">— Select a user —</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}) — {u.role === "org_contact" ? "Org Contact" : "Event Manager"}
              </option>
            ))}
          </select>
        )
      )}
    </div>
  );
}

// ── Edit Event Form ────────────────────────────────────────────────────────────

type EditEventFormProps = {
  event: EventRecord;
  orgUsers: UserRecord[];
  onSaved: (event: EventRecord) => void;
  onCancel: () => void;
};

const PREDEFINED_ROLES: NewRoleRow[] = [
  { roleKey: "safety_marshal",         displayName: "Safety Marshal" },
  { roleKey: "medic",                  displayName: "Medic" },
  { roleKey: "de_escalator",           displayName: "De-Escalator" },
  { roleKey: "chant_lead",             displayName: "Chant Lead" },
  { roleKey: "information_services",   displayName: "Info Services" },
  { roleKey: "registration",           displayName: "Registration" },
  { roleKey: "greeter",                displayName: "Greeter" },
  { roleKey: "timekeeper",             displayName: "Timekeeper" },
  { roleKey: "facilitator",            displayName: "Facilitator" },
  { roleKey: "canvasser",              displayName: "Canvasser" },
  { roleKey: "phone_banker",           displayName: "Phone Banker" },
  { roleKey: "av_tech",                displayName: "AV / Tech" },
  { roleKey: "photographer",           displayName: "Photographer / Videographer" },
  { roleKey: "setup_teardown",         displayName: "Setup & Teardown" },
  { roleKey: "childcare",              displayName: "Childcare" },
  { roleKey: "interpreter",            displayName: "Interpreter / Translation" },
  { roleKey: "accessibility_support",  displayName: "Accessibility Support" },
  { roleKey: "social_media",           displayName: "Social Media" },
  { roleKey: "outreach_coordinator",   displayName: "Outreach Coordinator" },
  { roleKey: "merchandise_sales",      displayName: "Merchandise Sales" },
  { roleKey: "emcee",                  displayName: "Emcee" },
];

function EditEventForm({ event, orgUsers = [], onSaved, onCancel }: EditEventFormProps) {
  const [name, setName] = useState(event.name);
  const parsedDates: string[] = event.eventDates ? (JSON.parse(event.eventDates) as string[]) : [];
  const [isMultiDay, setIsMultiDay] = useState(parsedDates.length > 1);
  const [eventDate, setEventDate] = useState(
    parsedDates.length > 0 ? parsedDates[0] : (event.eventDate ? event.eventDate.slice(0, 10) : "")
  );
  const [extraDates, setExtraDates] = useState<string[]>(parsedDates.length > 1 ? parsedDates.slice(1) : [""]);
  const [adminPassword, setAdminPassword] = useState("");
  const [mobilizeEventId, setMobilizeEventId] = useState(event.mobilizeEventId ?? "");
  const [giveawayEnabled, setGiveawayEnabled] = useState(event.giveawayEnabled);
  const [smsReentryEnabled, setSmsReentryEnabled] = useState(event.smsReentryEnabled);
  const [isActive, setIsActive] = useState(event.isActive);
  const [showDeactivateWarning, setShowDeactivateWarning] = useState(false);
  const [managerSelection, setManagerSelection] = useState<ManagerSelection>({ type: "keep" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Role editing state — initialized from current event roles
  const predefinedKeys = new Set(PREDEFINED_ROLES.map((r) => r.roleKey));
  const initialSelected = new Set(event.roles.filter((r) => predefinedKeys.has(r.roleKey)).map((r) => r.roleKey));
  const initialCustom = event.roles.filter((r) => !predefinedKeys.has(r.roleKey)).map((r) => ({ roleKey: r.roleKey, displayName: r.displayName }));
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<Set<string>>(initialSelected);
  const [customRoles, setCustomRoles] = useState<NewRoleRow[]>(initialCustom);
  const [customRoleInput, setCustomRoleInput] = useState("");

  const toggleRole = (key: string) =>
    setSelectedRoleKeys((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  const addCustomRole = () => {
    const display = customRoleInput.trim();
    if (!display) return;
    const key = display.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (selectedRoleKeys.has(key) || customRoles.some((r) => r.roleKey === key)) return;
    setCustomRoles((prev) => [...prev, { roleKey: key, displayName: display }]);
    setCustomRoleInput("");
  };

  const removeCustomRole = (key: string) => setCustomRoles((prev) => prev.filter((r) => r.roleKey !== key));

  const selectedFromList = PREDEFINED_ROLES.filter((r) => selectedRoleKeys.has(r.roleKey));
  const editRoles = [...selectedFromList, ...customRoles];

  const currentManager = orgUsers.find((u) => u.event?.id === event.id) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Event name is required"); return; }

    // Build dates for multi-day
    let builtEventDates: string[] | undefined;
    if (isMultiDay && eventDate) {
      const allDates = [eventDate, ...extraDates.filter((d) => d.trim())];
      if (allDates.length > 1) builtEventDates = allDates;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      mobilizeEventId: mobilizeEventId.trim() || null,
      giveawayEnabled,
      smsReentryEnabled,
      isActive,
      roles: editRoles.filter((r) => r.roleKey.trim() && r.displayName.trim()),
    };
    if (builtEventDates) {
      payload.eventDates = builtEventDates;
      payload.eventDate = builtEventDates[0];
    } else {
      payload.eventDate = eventDate || null;
      payload.eventDates = null;
    }
    if (adminPassword.trim()) payload.adminPassword = adminPassword.trim();

    if (managerSelection.type === "existing") payload.eventManagerId = managerSelection.userId;
    else if (managerSelection.type === "clear") payload.eventManagerId = null;

    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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

        <div className="sm:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-display text-xs uppercase tracking-wider">
              <Calendar className="w-3 h-3 inline mr-1" />
              {isMultiDay ? "Event Dates" : "Event Date"}
            </label>
            <button
              type="button"
              onClick={() => { setIsMultiDay((v) => !v); setExtraDates([""]); }}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border-2 border-foreground transition-colors ${isMultiDay ? "bg-primary text-white" : "bg-white text-foreground"}`}
            >
              Multi-day
            </button>
          </div>
          <Input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
          {isMultiDay && (
            <div className="space-y-2">
              {extraDates.map((d, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    type="date"
                    value={d}
                    onChange={(e) => {
                      const updated = [...extraDates];
                      updated[i] = e.target.value;
                      setExtraDates(updated);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setExtraDates((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-1 rounded border-2 border-foreground hover:bg-destructive hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtraDates((prev) => [...prev, ""])}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80"
              >
                <Plus className="w-3 h-3" /> Add another day
              </button>
            </div>
          )}
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

        <div className="sm:col-span-2 flex flex-wrap items-start gap-6 pt-1">
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
              onClick={() => setSmsReentryEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-12 items-center rounded-full border-4 border-foreground transition-colors ${smsReentryEnabled ? "bg-primary" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white border-2 border-foreground transform transition-transform ${smsReentryEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div>
              <p className="font-display text-xs uppercase tracking-wider">SMS Re-Entry</p>
              <p className="text-xs text-muted-foreground">{smsReentryEnabled ? "On — QR wristband SMS enabled" : "Off"}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => {
                if (isActive && event.checkedInCount > 0) {
                  setShowDeactivateWarning(true);
                } else {
                  setIsActive((v) => !v);
                  setShowDeactivateWarning(false);
                }
              }}
              className={`mt-0.5 relative inline-flex h-6 w-12 items-center rounded-full border-4 border-foreground transition-colors ${isActive ? "bg-green-500" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-3 w-3 rounded-full bg-white border-2 border-foreground transform transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div>
              <p className="font-display text-xs uppercase tracking-wider">Active</p>
              <p className="text-xs text-muted-foreground">{isActive ? "Yes — accepting check-ins" : "No — check-in page disabled"}</p>
              {showDeactivateWarning && (
                <div className="mt-2 p-3 bg-amber-50 border-2 border-amber-400 rounded-lg text-xs text-amber-800 space-y-2">
                  <p className="font-bold">This event has {event.checkedInCount} check-ins. Deactivating will disable the check-in page.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setIsActive(false); setShowDeactivateWarning(false); }} className="px-3 py-1 rounded border-2 border-amber-600 bg-amber-600 text-white font-bold text-xs">Deactivate anyway</button>
                    <button type="button" onClick={() => setShowDeactivateWarning(false)} className="px-3 py-1 rounded border-2 border-amber-600 font-bold text-xs">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role editing */}
      <div className="space-y-3 pt-3 border-t-2 border-foreground/10">
        <label className="font-display text-xs uppercase tracking-wider block">
          <Users className="w-3 h-3 inline mr-1" />Volunteer Roles
        </label>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_ROLES.map((r) => (
            <button
              key={r.roleKey}
              type="button"
              onClick={() => toggleRole(r.roleKey)}
              className={`text-xs px-3 py-1.5 rounded-lg border-2 font-medium transition-colors ${selectedRoleKeys.has(r.roleKey) ? "bg-primary text-white border-primary" : "bg-white border-foreground/30 hover:border-foreground"}`}
            >
              {r.displayName}
            </button>
          ))}
        </div>
        {customRoles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customRoles.map((r) => (
              <span key={r.roleKey} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border-2 bg-secondary border-foreground font-medium">
                {r.displayName}
                <button type="button" onClick={() => removeCustomRole(r.roleKey)} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={customRoleInput}
            onChange={(e) => setCustomRoleInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomRole(); } }}
            placeholder="Custom role name..."
            className="text-sm h-8"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustomRole}><Plus className="w-3 h-3" /></Button>
        </div>
        {editRoles.length === 0 && <p className="text-xs text-amber-600 font-medium">No roles selected — attendees won't see a volunteer option.</p>}
      </div>

      <EventManagerPicker
        orgUsers={orgUsers}
        currentManager={currentManager}
        onChange={setManagerSelection}
      />

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

// ── Create Organization Form ───────────────────────────────────────────────────

function CreateOrgForm({ onCreated }: { onCreated: (org: OrgRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const handleNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === autoSlug(name)) setSlug(autoSlug(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      const data = await res.json() as { org?: OrgRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create organization");
      toast({ title: "Organization created!", description: `"${data.org!.name}" is ready.` });
      onCreated(data.org!);
      setName(""); setSlug(""); setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
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
        Add Organization
        {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      {open && (
        <Card className="border-4 border-primary">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">Organization Name <span className="text-destructive">*</span></label>
                  <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Indivisible North Atlanta" required />
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider block mb-1">Slug <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Hash className="w-4 h-4 inline" />
                    </span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="ina"
                      className="pl-8 font-mono"
                      required
                      pattern="[a-z0-9-]+"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Short unique ID for this org</p>
                </div>
              </div>
              {error && <p className="text-destructive font-bold text-sm border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">{error}</p>}
              <div className="flex gap-3">
                <Button type="submit" isLoading={loading} className="flex-1">{loading ? "Creating..." : "Create Organization"}</Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────────

function QrModal({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const url = `${window.location.origin}/${event.slug}`;
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win || !svgRef.current) return;
    const svgHtml = svgRef.current.outerHTML;
    win.document.write(`
      <html><head><title>${event.name} — Check-In QR Code</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 28px; margin-bottom: 8px; }
        p { font-size: 16px; color: #555; margin-bottom: 24px; }
        svg { width: 300px; height: 300px; }
        .url { font-size: 13px; color: #888; margin-top: 16px; word-break: break-all; }
      </style></head>
      <body>
        <h1>${event.name} — Check-In</h1>
        <p>Scan to check in from your phone</p>
        ${svgHtml}
        <div class="url">${url}</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-sm p-8 flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
        <div className="w-full flex items-center justify-between">
          <h3 className="font-display text-2xl">{event.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl font-bold leading-none"><X className="w-6 h-6" /></button>
        </div>
        <QRCodeSVG ref={svgRef} value={url} size={240} level="H" className="border-4 border-foreground rounded-xl p-2" />
        <p className="font-mono text-xs text-muted-foreground text-center break-all">{url}</p>
        <Button className="w-full" onClick={handlePrint}>
          <Download className="w-4 h-4 mr-2" /> Print QR Code
        </Button>
      </div>
    </div>
  );
}

function EventCard({ event, orgUsers, onUpdated }: { event: EventRecord; orgUsers: UserRecord[]; onUpdated: (event: EventRecord) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showQR, setShowQR] = useState(false);

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
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 border border-gray-400 rounded-full px-2 py-0.5">Completed</span>
                )}
                {event.giveawayEnabled && (
                  <span className="text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-600 rounded-full px-2 py-0.5">
                    <Zap className="w-3 h-3 inline" /> Giveaway
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="font-mono text-sm text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
                  /{event.slug}
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
                {event.volunteerCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({event.attendeeCount} attendees · {event.volunteerCount} volunteers)
                  </span>
                )}
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

            {showQR && <QrModal event={event} onClose={() => setShowQR(false)} />}

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
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-4 border-primary bg-primary text-white hover:bg-primary/90 font-display text-base transition-colors shadow-brutal"
                  >
                    <Lock className="w-5 h-5" /> Open Event Admin
                  </a>
                <button
                    onClick={(e) => { e.stopPropagation(); setShowQR(true); }}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-4 border-foreground bg-secondary hover:bg-secondary/70 font-display text-base transition-colors shadow-brutal"
                  >
                    <QrCode className="w-5 h-5" /> QR Code
                  </button>
                </div>

            <div className="p-3 bg-gray-50 border-2 border-gray-200 rounded-lg">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Check-in URL</p>
              <p className="font-mono text-xs text-gray-700 break-all">{window.location.origin}/{event.slug}</p>
            </div>

            {!editing && (
              <div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                  className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  <Pencil className="w-4 h-4" /> Edit Event
                </button>
              </div>
            )}

            {editing && (
              <EditEventForm
                event={event}
                orgUsers={orgUsers}
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

const AUTO_REFRESH_MS = 30_000;

export default function SuperadminPage() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [superadminUsername, setSuperadminUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [eventsRes, orgsRes, usersRes, meRes] = await Promise.all([
        fetch("/api/superadmin/events", { credentials: "include" }),
        fetch("/api/superadmin/orgs", { credentials: "include" }),
        fetch("/api/superadmin/users", { credentials: "include" }),
        fetch("/api/superadmin/me", { credentials: "include" }),
      ]);
      if (!eventsRes.ok || !orgsRes.ok) {
        const errBody = await (eventsRes.ok ? orgsRes : eventsRes).json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? "Server returned an error. Try refreshing.");
      }
      const [eventsData, orgsData, usersData, meData] = await Promise.all([
        eventsRes.json() as Promise<{ events: EventRecord[] }>,
        orgsRes.json() as Promise<{ orgs: OrgRecord[] }>,
        usersRes.ok ? usersRes.json() as Promise<{ users: UserRecord[] }> : Promise.resolve({ users: [] }),
        meRes.ok ? meRes.json() as Promise<{ username: string }> : Promise.resolve({ username: "" }),
      ]);
      setEvents(eventsData.events);
      setOrgs(orgsData.orgs);
      setUsers(usersData.users);
      setSuperadminUsername(meData.username);
      setLastRefreshed(new Date());
    } catch {
      setLoadError("Could not load data. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      const res = await fetch("/api/superadmin/events", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { events: EventRecord[] };
      setEvents(data.events);
      setLastRefreshed(new Date());
    } catch {
    }
  };

  useEffect(() => {
    if (user?.role === "superadmin") void fetchAll();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "superadmin") return;
    refreshTimerRef.current = setInterval(() => { void fetchCounts(); }, AUTO_REFRESH_MS);
    return () => {
      if (refreshTimerRef.current !== null) clearInterval(refreshTimerRef.current);
    };
  }, [user?.role]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (user?.role !== "superadmin") return;
    const id = setInterval(() => { void fetchAll(); }, 30_000);
    return () => clearInterval(id);
  }, [user?.role]);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "superadmin")) {
      setLocation("/login");
    }
  }, [authLoading, user]);

  const handleLogout = async () => {
    await authLogout();
    setEvents([]); setOrgs([]); setUsers([]);
    setLocation("/login");
  };

  const totalCheckedIn = events.reduce((sum, e) => sum + (e.checkedInCount ?? 0), 0);
  const activeEvents = events.filter((e) => e.isActive).length;

  if (authLoading || !user || user.role !== "superadmin") {
    return null;
  }

  // Group events by org slug
  const eventsByOrg = new Map<string, EventRecord[]>();
  for (const event of events) {
    const key = event.org.slug ?? "unknown";
    if (!eventsByOrg.has(key)) eventsByOrg.set(key, []);
    eventsByOrg.get(key)!.push(event);
  }

  // Merge orgs list with any orgs that appear in events but aren't in orgs list yet
  const orgSlugsInList = new Set(orgs.map((o) => o.slug));
  const extraOrgs: OrgRecord[] = [];
  for (const event of events) {
    if (event.org.slug && !orgSlugsInList.has(event.org.slug)) {
      extraOrgs.push({ id: event.org.id, name: event.org.name ?? event.org.slug!, slug: event.org.slug!, eventCount: 0, createdAt: "" });
      orgSlugsInList.add(event.org.slug);
    }
  }
  const allOrgs = [...orgs, ...extraOrgs];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-foreground text-white py-6 px-6 md:px-12 sticky top-0 z-20 border-b-8 border-primary">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl md:text-5xl mb-1 text-white">Command Center</h1>
            <p className="text-lg text-gray-300 font-medium">OpsCheckIn · Platform Admin</p>
          </div>
          <div className="flex flex-col items-end gap-2 w-full md:w-auto">
            <div className="flex gap-3 flex-wrap justify-end">
              <Button variant="outline" className="bg-transparent border-white text-white hover:bg-white/10 hover:text-white" onClick={() => void fetchAll()} disabled={loading}>
                <RefreshCw className={`w-5 h-5 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
              </Button>
              <Button variant="outline" className="bg-transparent border-white/40 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => void handleLogout()}>
                <LogOut className="w-4 h-4 mr-2" />Sign Out
              </Button>
            </div>
            {lastRefreshed && (
              <p className="text-xs text-white/50 font-medium">
                Counts auto-refresh every 30s · Last updated {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-12 space-y-10">

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-primary text-white border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-primary-foreground/80 font-bold text-lg uppercase tracking-wider mb-2">Organizations</p>
                <p className="font-display text-6xl md:text-7xl">{loading ? "—" : allOrgs.length}</p>
              </div>
              <Calendar className="w-16 h-16 opacity-50" />
            </CardContent>
          </Card>
          <Card className="bg-secondary text-foreground border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-foreground/80 font-bold text-lg uppercase tracking-wider mb-2">Active Events</p>
                <p className="font-display text-6xl md:text-7xl">{loading ? "—" : activeEvents}</p>
              </div>
              <Zap className="w-16 h-16 opacity-50" />
            </CardContent>
          </Card>
          <Card className="bg-white text-foreground border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground font-bold text-lg uppercase tracking-wider mb-2">Total Checked In</p>
                <p className="font-display text-6xl md:text-7xl">{loading ? "—" : totalCheckedIn}</p>
              </div>
              <Users className="w-16 h-16 opacity-20" />
            </CardContent>
          </Card>
        </div>

        {loadError && (
          <div className="p-4 bg-red-50 border-2 border-destructive rounded-xl text-destructive font-bold text-sm">
            {loadError}
          </div>
        )}

        {/* Add Organization + Add User (side by side or stacked) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border-4 border-foreground rounded-2xl p-6 bg-white shadow-brutal">
            <CreateOrgForm onCreated={() => void fetchAll()} />
          </div>
          <div className="border-4 border-foreground rounded-2xl p-6 bg-white shadow-brutal">
            <CreateUserForm orgs={allOrgs} events={events} onCreated={() => void fetchAll()} />
          </div>
        </div>

        {/* Platform Users — shows the superadmin only */}
        <div className="border-4 border-foreground rounded-2xl overflow-hidden shadow-brutal">
          <div className="bg-foreground text-white px-6 py-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5" />
            <h2 className="font-display text-2xl">Platform Users</h2>
            <span className="ml-auto text-gray-400 text-sm font-mono">1 total</span>
          </div>
          <div className="bg-white px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-lg">{superadminUsername || "Platform Admin"}</span>
                <span className="text-xs font-bold bg-gray-100 text-gray-800 border border-gray-400 rounded-full px-2 py-0.5">Platform Admin</span>
                <span className="text-xs font-bold bg-green-100 text-green-800 border border-green-400 rounded-full px-2 py-0.5">Active</span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">OpsCheckIn · Full platform access</div>
            </div>
          </div>
        </div>

        {/* Organizations → Events */}
        <div className="space-y-8">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(["all", "active", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-5 py-2 rounded-full font-display text-sm uppercase tracking-wider border-2 transition-colors ${
                  statusFilter === f
                    ? "bg-foreground text-white border-foreground"
                    : "bg-white text-foreground border-foreground/30 hover:border-foreground"
                }`}
              >
                {f === "all" ? "All Events" : f === "active" ? "Active" : "Completed"}
              </button>
            ))}
          </div>

          {allOrgs.length === 0 && !loading && (
            <div className="text-center text-muted-foreground py-12 font-medium">No organizations yet. Add one above.</div>
          )}

          {allOrgs.map((org) => {
            const allOrgEvents = eventsByOrg.get(org.slug) ?? [];
            const orgEvents = allOrgEvents.filter((e) =>
              statusFilter === "all" ? true : statusFilter === "active" ? e.isActive : !e.isActive
            );
            if (orgEvents.length === 0 && statusFilter !== "all") return null;
            return (
              <div key={org.slug} className="border-4 border-foreground rounded-2xl overflow-hidden shadow-brutal">
                {/* Org header */}
                <div className="bg-foreground text-white px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl">{org.name}</h2>
                    <p className="font-mono text-sm text-gray-400">/{org.slug} · {orgEvents.length} event{orgEvents.length !== 1 ? "s" : ""} · {orgEvents.reduce((s, e) => s + e.checkedInCount, 0)} checked in</p>
                  </div>
                  <a
                    href={`${import.meta.env.BASE_URL}org/${org.id}`}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-white/40 bg-white/10 hover:bg-white/20 text-white font-display text-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Open Org Dashboard
                  </a>
                </div>

                {/* Org contacts for this org */}
                {users.filter((u) => u.role === "org_contact" && u.org?.id === org.id).map((u) => (
                  <div key={u.id} className="bg-blue-50 border-b-2 border-foreground/10 px-6 py-3 flex items-center gap-3 flex-wrap">
                    <UserPlus className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="font-semibold text-sm">{u.name}</span>
                      <span className="text-xs font-bold bg-blue-100 text-blue-800 border border-blue-400 rounded-full px-2 py-0.5">Org Contact</span>
                      {u.passwordSet ? (
                        <span className="text-xs font-bold bg-green-100 text-green-800 border border-green-400 rounded-full px-2 py-0.5">Active</span>
                      ) : (
                        <span className="text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-400 rounded-full px-2 py-0.5">Pending first login</span>
                      )}
                      <span className="text-xs text-muted-foreground"><Mail className="w-3 h-3 inline mr-1" />{u.email}</span>
                    </div>
                  </div>
                ))}

                {/* Events under this org */}
                <div className="p-6 space-y-4 bg-gray-50">
                  {orgEvents.length === 0 && (
                    <p className="text-muted-foreground text-sm italic">No events yet for this organization.</p>
                  )}
                  {orgEvents.map((event) => (
                    <div key={event.id} className="space-y-0">
                      <EventCard event={event} orgUsers={users.filter((u) => u.org?.id === org.id)} onUpdated={() => void fetchAll()} />
                      {/* Event managers for this event */}
                      {users.filter((u) => u.event?.id === event.id).map((u) => (
                        <div key={u.id} className="bg-purple-50 border-2 border-t-0 border-foreground/20 rounded-b-xl px-5 py-2.5 flex items-center gap-3 flex-wrap">
                          <Key className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            <span className="font-semibold text-sm">{u.name}</span>
                            <span className="text-xs font-bold bg-purple-100 text-purple-800 border border-purple-400 rounded-full px-2 py-0.5">Event Manager</span>
                            {u.passwordSet ? (
                              <span className="text-xs font-bold bg-green-100 text-green-800 border border-green-400 rounded-full px-2 py-0.5">Active</span>
                            ) : (
                              <span className="text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-400 rounded-full px-2 py-0.5">Pending first login</span>
                            )}
                            <span className="text-xs text-muted-foreground"><Mail className="w-3 h-3 inline mr-1" />{u.email}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Add event for this org */}
                  <div className="pt-2">
                    <CreateEventForm orgSlug={org.slug} orgName={org.name} orgId={org.id} orgUsers={users.filter((u) => u.org?.id === org.id)} onCreated={() => void fetchAll()} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
