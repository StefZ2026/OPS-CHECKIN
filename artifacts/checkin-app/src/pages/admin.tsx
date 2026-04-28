import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import {
  Search, Users, UserCheck, UserPlus, RefreshCw,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Shield, Activity, HeartHandshake, Megaphone,
  Download, LogOut, Lock, Upload, QrCode, Printer, CheckCircle2,
  Eye, EyeOff, Trash2, Info, HardHat, AlertTriangle, Pencil, X,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAttendees } from "@/hooks/use-attendees";
import { useToast } from "@/hooks/use-toast";
import { getAdminToken, setAdminToken, clearAdminToken, loginAdmin } from "@/hooks/use-admin-auth";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useEventConfig } from "@/hooks/use-event-config";
import { eventApiBase, getEventSlug } from "@/lib/event-slug";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AttendeeWithRoles, AttendeeRoleRoleName } from "@workspace/api-client-react";

type SortKey = "name" | "email" | "type" | "checkedInAt";
type SortDir = "asc" | "desc";

const ROLE_META: Record<AttendeeRoleRoleName, { label: string; Icon: React.ElementType; color: string }> = {
  safety_marshal:       { label: "Safety Marshal",       Icon: Shield,        color: "bg-blue-100 text-blue-800 border-blue-800" },
  medic:                { label: "Medic",                Icon: Activity,      color: "bg-red-100 text-red-800 border-red-800" },
  de_escalator:         { label: "De-escalator",         Icon: HeartHandshake,color: "bg-purple-100 text-purple-800 border-purple-800" },
  chant_lead:           { label: "Chant Lead",           Icon: Megaphone,     color: "bg-yellow-100 text-yellow-800 border-yellow-800" },
  information_services: { label: "Info Services",        Icon: Info,          color: "bg-green-100 text-green-800 border-green-800" },
};

const ALL_ROLES: AttendeeRoleRoleName[] = ["safety_marshal", "medic", "de_escalator", "chant_lead", "information_services"];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-4 h-4 opacity-40 inline ml-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-4 h-4 inline ml-1" />
    : <ChevronDown className="w-4 h-4 inline ml-1" />;
}

function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: eventConfig } = useEventConfig();
  const loginSubtitle = eventConfig?.name ? `ICU ${eventConfig.name}` : "ICU Check-In";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await loginAdmin(password);
      setAdminToken(token);
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
              <h1 className="font-display text-3xl leading-tight">Admin Access</h1>
              <p className="text-muted-foreground font-medium">{loginSubtitle}</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="font-display text-lg uppercase tracking-wider block mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  autoFocus
                  className="w-full border-4 border-foreground rounded-lg px-4 py-3 pr-14 text-lg font-medium focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-destructive font-bold text-base border-2 border-destructive rounded-lg px-4 py-2 bg-red-50">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" isLoading={loading}>
              {loading ? "Checking..." : "Unlock Dashboard"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

type NameConflict = {
  email: string;
  option1: { firstName: string; lastName: string; context: string };
  option2: { firstName: string; lastName: string; context: string };
  recommendation: 1 | 2;
  recommendationReason: string;
};
type UploadStatus = { inserted: number; skipped: number; totalInDatabase: number; nameConflicts?: NameConflict[] };

function CsvUploadSection() {
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState<null | UploadStatus>(null);
  const [nameConflicts, setNameConflicts] = useState<NameConflict[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!csvText.trim()) { setError("Please select a CSV file first."); return; }
    setError(""); setLoading(true); setStatus(null); setNameConflicts([]);
    try {
      const res = await fetch(`${eventApiBase()}/admin/upload-registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
        body: JSON.stringify({ csv: csvText }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Upload failed");
      }
      const d = await res.json() as UploadStatus;
      setStatus(d);
      setNameConflicts(d.nameConflicts ?? []);
      setCsvText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const resolveConflict = async (conflict: NameConflict, chosen: 1 | 2) => {
    setResolving(conflict.email);
    const pick = chosen === 1 ? conflict.option1 : conflict.option2;
    try {
      await fetch(`${eventApiBase()}/admin/upload-registrations/resolve-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
        body: JSON.stringify({ email: conflict.email, firstName: pick.firstName, lastName: pick.lastName }),
      });
      setNameConflicts(prev => prev.filter(c => c.email !== conflict.email));
    } finally {
      setResolving(null);
    }
  };

  const resolveAsBoth = async (conflict: NameConflict) => {
    setResolving(conflict.email);
    try {
      await fetch(`${eventApiBase()}/admin/upload-registrations/accept-both`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
        body: JSON.stringify({ email: conflict.email, option1: conflict.option1, option2: conflict.option2 }),
      });
      setNameConflicts(prev => prev.filter(c => c.email !== conflict.email));
    } finally {
      setResolving(null);
    }
  };

  return (
    <Card className="border-2 border-foreground">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Upload className="w-6 h-6" />
          <h3 className="font-display text-xl">Upload Pre-Registration List</h3>
        </div>
        <p className="text-muted-foreground font-medium text-sm">
          Export your Mobilize attendee list as CSV and upload it here. The app will automatically mark matching attendees as pre-registered during check-in.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="flex-1 text-sm border-2 border-foreground rounded-lg px-3 py-2 font-medium cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-bold file:bg-foreground file:text-white hover:file:bg-foreground/80"
          />
          <Button onClick={handleUpload} isLoading={loading} disabled={!csvText || loading}>
            <Upload className="w-4 h-4 mr-2" /> Upload
          </Button>
        </div>
        {error && <p className="text-destructive font-bold text-sm">{error}</p>}
        {status && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-green-700 flex-shrink-0" />
            <p className="font-bold text-green-800 text-sm">
              Loaded {status.inserted} registrations ({status.skipped} skipped as duplicates) — {status.totalInDatabase} total pre-registrations on file.
            </p>
          </div>
        )}

        {nameConflicts.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border-2 border-yellow-500 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-yellow-700 flex-shrink-0" />
              <p className="font-bold text-yellow-800 text-sm">
                {nameConflicts.length} name spelling conflict{nameConflicts.length !== 1 ? "s" : ""} — same contact info, different spellings. Which is correct?
              </p>
            </div>
            {nameConflicts.map((conflict) => {
              const isResolving = resolving === conflict.email;
              return (
                <div key={conflict.email} className="border-2 border-yellow-400 rounded-xl p-4 bg-yellow-50 space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">Contact: {conflict.email}</p>
                  <p className="text-xs font-bold text-yellow-700 italic">{conflict.recommendationReason}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([1, 2] as const).map((n) => {
                      const opt = n === 1 ? conflict.option1 : conflict.option2;
                      const isRecommended = conflict.recommendation === n;
                      return (
                        <button key={n} disabled={isResolving}
                          onClick={() => resolveConflict(conflict, n)}
                          className={`text-left p-4 rounded-xl border-4 transition-all space-y-1 disabled:opacity-50
                            ${isRecommended ? "border-primary bg-primary/5 hover:bg-primary/10" : "border-foreground bg-white hover:bg-gray-50"}`}>
                          {isRecommended && (
                            <span className="text-xs font-bold bg-primary text-white px-2 py-0.5 rounded-full">RECOMMENDED</span>
                          )}
                          <p className={`font-display text-xl leading-tight ${isRecommended ? "text-primary" : ""}`}>
                            {opt.firstName} {opt.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground font-medium">{opt.context}</p>
                        </button>
                      );
                    })}
                  </div>
                  <button disabled={isResolving}
                    onClick={() => resolveAsBoth(conflict)}
                    className="w-full p-4 rounded-xl border-4 border-green-600 bg-green-50 hover:bg-green-100 transition-all text-left space-y-1 disabled:opacity-50">
                    <p className="font-display text-lg text-green-800">✅ These are two different people sharing this email</p>
                    <p className="text-xs text-green-700 font-medium">
                      Both will be accepted. Whichever one arrives second at check-in will be asked to provide a different email and will receive a free No ICE button as a thank-you.
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QrCodeSection() {
  const [url, setUrl] = useState(window.location.origin + "/");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const { data: eventConfig } = useEventConfig();
  const qrEventTitle = eventConfig?.name ?? "Check-In";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setQrDataUrl).catch(console.error);
  }, [url]);

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>${qrEventTitle} — Check-In QR Code</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 28px; margin-bottom: 8px; }
        p { font-size: 16px; color: #555; margin-bottom: 24px; }
        img { width: 300px; height: 300px; }
        .url { font-size: 13px; color: #888; margin-top: 16px; word-break: break-all; }
      </style></head>
      <body>
        <h1>${qrEventTitle} — Check-In</h1>
        <p>Scan to check in from your phone</p>
        <img src="${qrDataUrl}" />
        <div class="url">${url}</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <Card className="border-2 border-foreground">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <QrCode className="w-6 h-6" />
          <h3 className="font-display text-xl">Self-Check-In QR Code</h3>
        </div>
        <p className="text-muted-foreground font-medium text-sm">
          Print this and place it on clipboards or at the entrance. Attendees scan it on their phones to check themselves in.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste your published app URL here..."
            className="flex-1 text-sm border-2 border-foreground rounded-lg px-3 py-2 font-medium focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR Code" className="w-40 h-40 border-4 border-foreground rounded-xl" />
          )}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground break-all">{url}</p>
            <Button variant="outline" onClick={handlePrint} disabled={!qrDataUrl}>
              <Printer className="w-4 h-4 mr-2" /> Print QR Code
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type RoleConflict = {
  firstName: string;
  lastName: string;
  oldRole: { roleName: string; title: string };
  newRole: { roleName: string; title: string };
  recommendationReason: string;
};

function VolunteerUploadSection() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<null | { inserted: number; skipped: number; totalInDatabase: number; invalidRows?: number[]; duplicatesRemoved?: number }>(null);
  const [roleConflicts, setRoleConflicts] = useState<RoleConflict[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(""); setStatus(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // Get raw rows as arrays so we can find the real header row
        const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
        // Find the first row that contains both "name" and "role" (case-insensitive)
        const headerRowIdx = raw.findIndex((row) => {
          const lower = row.map((c) => String(c).toLowerCase().trim());
          return lower.includes("name") && lower.includes("role");
        });
        if (headerRowIdx === -1) {
          setError("Could not find Name and Role columns in this file.");
          return;
        }
        const headers = raw[headerRowIdx].map((c) => String(c).toLowerCase().trim());
        const dataRows = raw.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c).trim() !== ""));
        const parsed = dataRows.map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = String(row[i] ?? ""); });
          return obj;
        });
        setRows(parsed);
      } catch {
        setError("Could not read file. Please make sure it's a valid Excel (.xlsx) file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (rows.length === 0) { setError("Please select an Excel file first."); return; }
    setError(""); setLoading(true); setStatus(null); setRoleConflicts([]);
    try {
      const res = await fetch(`${eventApiBase()}/admin/upload-volunteers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json() as { inserted?: number; skipped?: number; totalInDatabase?: number; error?: string; invalidRows?: number[]; roleConflicts?: RoleConflict[] };
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setStatus({ inserted: d.inserted ?? 0, skipped: d.skipped ?? 0, totalInDatabase: d.totalInDatabase ?? 0, invalidRows: d.invalidRows });
      setRoleConflicts(d.roleConflicts ?? []);
      setRows([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const resolveRoleConflict = async (conflict: RoleConflict, chosenRoleName: string) => {
    const key = `${conflict.firstName} ${conflict.lastName}`;
    setResolving(key);
    try {
      await fetch(`${eventApiBase()}/admin/upload-volunteers/resolve-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
        body: JSON.stringify({ firstName: conflict.firstName, lastName: conflict.lastName, roleName: chosenRoleName }),
      });
      setRoleConflicts(prev => prev.filter(c => !(c.firstName === conflict.firstName && c.lastName === conflict.lastName)));
    } finally {
      setResolving(null);
    }
  };

  return (
    <Card className="border-2 border-primary">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <HardHat className="w-6 h-6 text-primary" />
          <h3 className="font-display text-xl text-primary">Upload Volunteer List</h3>
        </div>
        <p className="text-muted-foreground font-medium text-sm">
          Upload your volunteer Excel sheet (.xlsx). Required columns: <strong>Name</strong> (full name) and <strong>Role</strong>. Optional: Email, Phone.
          New volunteers are added; existing entries are kept and duplicates are skipped.
        </p>
        <p className="text-muted-foreground text-xs">
          Accepted roles: Safety Marshal, Medic, De-Escalator, Chant Lead, Information Services
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFile}
            className="flex-1 text-sm border-2 border-foreground rounded-lg px-3 py-2 font-medium cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-bold file:bg-primary file:text-white hover:file:bg-primary/80"
          />
          <Button onClick={handleUpload} isLoading={loading} disabled={rows.length === 0 || loading}
            className="bg-primary hover:bg-primary/90">
            <Upload className="w-4 h-4 mr-2" /> Upload
          </Button>
        </div>
        {fileName && rows.length > 0 && !status && (
          <p className="text-sm font-medium text-muted-foreground">
            📄 {fileName} — {rows.length} rows ready to upload
          </p>
        )}
        {error && <p className="text-destructive font-bold text-sm">{error}</p>}
        {status && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border-2 border-green-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-green-700 flex-shrink-0" />
            <div>
              <p className="font-bold text-green-800 text-sm">
                Loaded {status.inserted} volunteers into the system — {status.totalInDatabase} total on file.
              </p>
              {(status.duplicatesRemoved ?? 0) > 0 && (
                <p className="text-blue-700 text-xs font-medium mt-1">
                  {status.duplicatesRemoved} duplicate name{status.duplicatesRemoved === 1 ? "" : "s"} removed automatically.
                </p>
              )}
              {status.skipped > 0 && (
                <p className="text-yellow-700 text-xs font-medium mt-1">
                  {status.skipped} rows skipped (missing name or unrecognized role).
                </p>
              )}
            </div>
          </div>
        )}

        {roleConflicts.length > 0 && (
          <div className="space-y-3">
            <p className="font-bold text-orange-700 text-sm">
              ⚠️ {roleConflicts.length} role change{roleConflicts.length === 1 ? "" : "s"} detected — please confirm which role is correct:
            </p>
            {roleConflicts.map((conflict) => {
              const key = `${conflict.firstName} ${conflict.lastName}`;
              const isResolving = resolving === key;
              return (
                <div key={key} className="border-2 border-orange-400 rounded-xl p-4 bg-orange-50 space-y-3">
                  <p className="font-bold text-sm">
                    {conflict.firstName} {conflict.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{conflict.recommendationReason}</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      disabled={isResolving}
                      onClick={() => resolveRoleConflict(conflict, conflict.newRole.roleName)}
                      className="flex-1 border-2 border-orange-500 rounded-lg p-3 text-left hover:bg-orange-100 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">New file (later entry)</p>
                          <p className="font-bold text-sm">{conflict.newRole.title}</p>
                        </div>
                        <span className="text-xs font-bold text-orange-700 bg-orange-200 px-2 py-1 rounded-full shrink-0">RECOMMENDED</span>
                      </div>
                    </button>
                    <button
                      disabled={isResolving}
                      onClick={() => resolveRoleConflict(conflict, conflict.oldRole.roleName)}
                      className="flex-1 border-2 border-foreground/30 rounded-lg p-3 text-left hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Previous entry</p>
                        <p className="font-bold text-sm">{conflict.oldRole.title}</p>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type RoleEdit = {
  id?: number;
  roleName: AttendeeRoleRoleName;
  wantsToServeToday: boolean | null;
  isTrained: boolean;
  hasServed: boolean;
  isNew?: boolean;
  isDeleted?: boolean;
};
type EditForm = { firstName: string; lastName: string; phone: string; email: string; roles: RoleEdit[] };

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isRefetching } = useAttendees();
  const { data: eventConfig } = useEventConfig();
  const eventTitle = eventConfig?.name ?? "No Kings 3 Rally";
  const eventDateDisplay = useMemo(() => {
    if (!eventConfig?.eventDate) return "March 28";
    const datePart = String(eventConfig.eventDate).slice(0, 10);
    const d = new Date(datePart + "T12:00:00");
    return isNaN(d.getTime())
      ? String(eventConfig.eventDate)
      : d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }, [eventConfig]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("checkedInAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedRole, setSelectedRole] = useState<AttendeeRoleRoleName | null>(null);
  const [roleFilter, setRoleFilter] = useState<"served" | "trained">("served");
  const [togglingRoleId, setTogglingRoleId] = useState<number | null>(null);
  const [editingAttendee, setEditingAttendee] = useState<AttendeeWithRoles | null>(null);
  const [showPrizeWinners, setShowPrizeWinners] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ firstName: "", lastName: "", phone: "", email: "", roles: [] });
  const [editSaving, setEditSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusToggling, setStatusToggling] = useState(false);

  const handleStatusToggle = async () => {
    if (!window.confirm(
      eventConfig?.isActive
        ? "Mark this event as Completed? Attendees can still be viewed but check-in will be disabled."
        : "Mark this event as Active again?"
    )) return;
    setStatusToggling(true);
    try {
      const res = await fetch(`${eventApiBase()}/admin/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed");
      refetch();
      toast({ title: eventConfig?.isActive ? "Event marked Completed" : "Event marked Active" });
    } catch {
      toast({ title: "Could not update status", variant: "destructive" });
    } finally {
      setStatusToggling(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`${eventApiBase()}/admin/export-xlsx`, {
        headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${getEventSlug()}-full-roster-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Your spreadsheet is downloading." });
    } catch (err) {
      console.error("Export failed:", err);
      toast({ title: "Export failed", description: String((err as Error)?.message ?? err), variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleToggleTrained = async (roleId: number, current: boolean) => {
    setTogglingRoleId(roleId);
    try {
      await fetch(`${eventApiBase()}/admin/attendee-roles/${roleId}/trained`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken() ?? ""}` },
        body: JSON.stringify({ isTrained: !current }),
      });
      refetch();
    } finally {
      setTogglingRoleId(null);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  const handleEditOpen = (attendee: AttendeeWithRoles) => {
    setEditingAttendee(attendee);
    setEditForm({
      firstName: attendee.firstName,
      lastName: attendee.lastName,
      phone: "",
      email: attendee.email,
      roles: attendee.roles.map((r) => ({
        id: r.id,
        roleName: r.roleName as AttendeeRoleRoleName,
        wantsToServeToday: r.wantsToServeToday ?? null,
        isTrained: r.isTrained,
        hasServed: r.hasServed,
      })),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAttendee) return;
    setEditSaving(true);
    try {
      const auth = `Bearer ${getAdminToken() ?? ""}`;
      const jsonH = { "Content-Type": "application/json", Authorization: auth };

      const res = await fetch(`${eventApiBase()}/admin/attendees/${editingAttendee.id}`, {
        method: "PATCH",
        headers: jsonH,
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          ...(editForm.phone ? { phone: editForm.phone } : {}),
        }),
      });
      if (!res.ok) throw new Error("Save failed");

      for (const role of editForm.roles) {
        if (role.isDeleted && role.id) {
          await fetch(`${eventApiBase()}/admin/attendee-roles/${role.id}`, { method: "DELETE", headers: { Authorization: auth } });
        } else if (role.isNew) {
          await fetch(`${eventApiBase()}/admin/attendees/${editingAttendee.id}/roles`, {
            method: "POST",
            headers: jsonH,
            body: JSON.stringify({ roleName: role.roleName, wantsToServeToday: role.wantsToServeToday, isTrained: role.isTrained, hasServed: role.hasServed }),
          });
        } else if (role.id) {
          const orig = editingAttendee.roles.find((r) => r.id === role.id);
          const changed = orig && (orig.roleName !== role.roleName || (orig.wantsToServeToday ?? null) !== role.wantsToServeToday || orig.isTrained !== role.isTrained || orig.hasServed !== role.hasServed);
          if (changed) {
            await fetch(`${eventApiBase()}/admin/attendee-roles/${role.id}`, {
              method: "PUT",
              headers: jsonH,
              body: JSON.stringify({ roleName: role.roleName, wantsToServeToday: role.wantsToServeToday, isTrained: role.isTrained, hasServed: role.hasServed }),
            });
          }
        }
      }

      setEditingAttendee(null);
      refetch();
      toast({ title: "Saved", description: "Attendee updated." });
    } catch {
      toast({ title: "Save failed", description: "Could not save — please try again.", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (email: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the roster? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${eventApiBase()}/admin/attendees`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAdminToken() ?? ""}`,
        },
        body: JSON.stringify({ emails: [email] }),
      });
      if (res.ok) refetch();
      else alert("Delete failed — please try again.");
    } catch {
      alert("Delete failed — please try again.");
    }
  };

  const filteredAndSorted = (data?.attendees ?? [])
    .filter((a) =>
      `${a.firstName} ${a.lastName} ${a.email}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      else if (sortKey === "email") cmp = a.email.localeCompare(b.email);
      else if (sortKey === "type") cmp = Number(b.preRegistered) - Number(a.preRegistered);
      else if (sortKey === "checkedInAt") cmp = new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });

  const roleCounts = ALL_ROLES.map((role) => {
    const serving = (data?.attendees ?? []).filter((a) => a.roles.some((r) => r.roleName === role && r.wantsToServeToday !== false));
    const trained = serving.filter((a) => a.roles.some((r) => r.roleName === role && r.wantsToServeToday !== false && r.isTrained));
    return { role, count: serving.length, trained: trained.length };
  });

  if (isError) {
    return (
      <div className="min-h-screen p-12 flex flex-col items-center justify-center bg-background">
        <div className="p-8 bg-destructive text-white rounded-xl border-4 border-foreground shadow-brutal max-w-md text-center">
          <h2 className="font-display text-3xl mb-4">Error loading data</h2>
          <p className="text-lg font-medium mb-6">Failed to fetch the attendee list.</p>
          <Button variant="outline" onClick={() => refetch()}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-foreground text-white py-6 px-6 md:px-12 sticky top-0 z-20 border-b-8 border-primary">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src="/icu-logo.jpg" alt="ICU" className="w-14 h-14 rounded-full object-cover hidden md:block" />
            <div>
              <h1 className="font-display text-3xl md:text-5xl mb-1 text-white">Command Center</h1>
              <div className="flex items-center gap-3">
                <p className="text-lg text-gray-300 font-medium">ICU {eventTitle} · {eventDateDisplay}</p>
                <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 ${eventConfig?.isActive === false ? "bg-gray-700 border-gray-500 text-gray-300" : "bg-green-500 border-green-300 text-white"}`}>
                  {eventConfig?.isActive === false ? "Completed" : "Active"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto flex-wrap">
            <Button
              variant="outline"
              className="bg-transparent border-white text-white hover:bg-white/10 hover:text-white"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              className={`bg-transparent border-white text-white hover:bg-white/10 hover:text-white ${statusToggling ? "opacity-50" : ""}`}
              onClick={handleStatusToggle}
              disabled={statusToggling}
              title={eventConfig?.isActive === false ? "Mark Active" : "Mark Completed"}
            >
              {eventConfig?.isActive === false
                ? <><ToggleLeft className="w-5 h-5 mr-2" />Mark Active</>
                : <><ToggleRight className="w-5 h-5 mr-2" />Mark Completed</>
              }
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowPrizeWinners(true)}
              disabled={isLoading}
            >
              🏅 Prize Winners
            </Button>
            <Button
              variant="secondary"
              onClick={handleExport}
              disabled={isLoading || isExporting}
            >
              <Download className={`w-5 h-5 mr-2 ${isExporting ? "animate-bounce" : ""}`} />
              {isExporting ? "Exporting…" : "Export Excel"}
            </Button>
            <Button
              variant="outline"
              className="bg-transparent border-white/40 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-12 space-y-10">

        {/* Attendance Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-primary text-white border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-primary-foreground/80 font-bold text-lg uppercase tracking-wider mb-2">Total Checked In</p>
                <p className="font-display text-6xl md:text-7xl">{isLoading ? "—" : data?.total}</p>
              </div>
              <Users className="w-16 h-16 opacity-50" />
            </CardContent>
          </Card>
          <Card className="bg-secondary text-foreground border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-foreground/80 font-bold text-lg uppercase tracking-wider mb-2">Pre-Registered</p>
                <p className="font-display text-6xl md:text-7xl">{isLoading ? "—" : data?.preRegisteredCount}</p>
              </div>
              <UserCheck className="w-16 h-16 opacity-50" />
            </CardContent>
          </Card>
          <Card className="bg-white text-foreground border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground font-bold text-lg uppercase tracking-wider mb-2">Walk-ins</p>
                <p className="font-display text-6xl md:text-7xl">{isLoading ? "—" : data?.walkInCount}</p>
              </div>
              <UserPlus className="w-16 h-16 opacity-20" />
            </CardContent>
          </Card>
        </div>

        {/* Tools: CSV Upload + QR Code */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CsvUploadSection />
          <QrCodeSection />
        </div>

        {/* Volunteer Upload */}
        <VolunteerUploadSection />

        {/* Role Breakdown */}
        <div>
          <h2 className="font-display text-2xl mb-4">Volunteer Role Breakdown <span className="font-sans text-sm font-medium text-muted-foreground normal-case">(click a role to see who's signed up)</span></h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {roleCounts.map(({ role, count, trained }) => {
              const meta = ROLE_META[role];
              return (
                <Card key={role} className="border-2 border-foreground cursor-pointer hover:border-primary hover:shadow-brutal-sm transition-all"
                  onClick={() => setSelectedRole(role)}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <meta.Icon className="w-5 h-5" />
                      <span className="font-display text-sm uppercase tracking-wide">{meta.label}</span>
                    </div>
                    <p className="font-display text-4xl mb-1">{isLoading ? "—" : count}</p>
                    <p className="text-sm text-muted-foreground font-medium">
                      {isLoading ? "" : `${trained} trained`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Role volunteer modal */}
        {selectedRole && (() => {
          const meta = ROLE_META[selectedRole];
          const served = (data?.attendees ?? []).filter(a => a.roles.some(r => r.roleName === selectedRole && r.wantsToServeToday !== false));
          const trained = served.filter(a => a.roles.some(r => r.roleName === selectedRole && r.wantsToServeToday !== false && r.isTrained));
          const list = roleFilter === "trained" ? trained : served;
          return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => { setSelectedRole(null); setRoleFilter("served"); }}>
              <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b-4 border-foreground">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border-2 border-foreground ${meta.color}`}>
                      <meta.Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-display text-2xl">{meta.label}</h3>
                  </div>
                  <button onClick={() => { setSelectedRole(null); setRoleFilter("served"); }} className="text-muted-foreground hover:text-foreground text-2xl font-bold leading-none">×</button>
                </div>
                {/* Served / Trained tabs */}
                <div className="flex border-b-4 border-foreground">
                  <button
                    onClick={() => setRoleFilter("served")}
                    className={`flex-1 py-3 font-display text-lg transition-colors ${roleFilter === "served" ? "bg-foreground text-white" : "hover:bg-muted/30"}`}
                  >
                    Served ({served.length})
                  </button>
                  <button
                    onClick={() => setRoleFilter("trained")}
                    className={`flex-1 py-3 font-display text-lg transition-colors border-l-4 border-foreground ${roleFilter === "trained" ? "bg-primary text-white" : "hover:bg-muted/30"}`}
                  >
                    Trained ({trained.length})
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                  {list.length === 0 ? (
                    <p className="text-center text-muted-foreground font-medium py-8">
                      {roleFilter === "trained" ? "No trained volunteers on record for this role." : "No volunteers signed up yet."}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map(a => {
                        const roleEntry = a.roles.find(r => r.roleName === selectedRole);
                        if (!roleEntry) return null;
                        const toggling = togglingRoleId === roleEntry.id;
                        return (
                          <li key={a.id} className="flex items-center justify-between p-3 rounded-lg border-2 border-border hover:bg-muted/30 gap-3">
                            <div className="min-w-0">
                              <p className="font-bold">{a.firstName} {a.lastName}</p>
                              <p className="text-sm text-muted-foreground truncate">{a.email}</p>
                            </div>
                            <button
                              onClick={() => handleToggleTrained(roleEntry.id!, roleEntry.isTrained)}
                              disabled={toggling}
                              className={`shrink-0 text-xs font-bold border-2 rounded-full px-3 py-1 transition-colors ${
                                roleEntry.isTrained
                                  ? "border-primary text-primary hover:bg-primary hover:text-white"
                                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                              } ${toggling ? "opacity-50 cursor-wait" : ""}`}
                            >
                              {toggling ? "…" : roleEntry.isTrained ? "Trained ✓" : "Mark trained"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Attendee Table */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h2 className="font-display text-3xl">Attendee Roster</h2>
            <div className="w-full md:w-96">
              <Input
                placeholder="Search by name or email..."
                icon={<Search className="w-6 h-6" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="py-3 text-lg"
              />
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted text-foreground uppercase tracking-wider font-display text-sm border-b-4 border-foreground">
                    {(
                      [
                        { key: "name" as SortKey, label: "Name" },
                        { key: "email" as SortKey, label: "Email" },
                        { key: "type" as SortKey, label: "Type" },
                        { key: null, label: "Volunteer Roles" },
                        { key: "checkedInAt" as SortKey, label: "Check-in Time" },
                        { key: null, label: "" },
                      ] as { key: SortKey | null; label: string }[]
                    ).map(({ key, label }) => (
                      <th
                        key={label}
                        className={`p-5 ${key ? "cursor-pointer select-none hover:bg-muted/80" : ""}`}
                        onClick={key ? () => handleSort(key) : undefined}
                      >
                        {label}
                        {key && <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-xl font-bold text-muted-foreground">
                        Loading roster...
                      </td>
                    </tr>
                  ) : filteredAndSorted.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-xl font-bold text-muted-foreground">
                        No attendees found.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSorted.map((attendee: AttendeeWithRoles) => (
                      <tr key={attendee.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-5 font-bold text-lg whitespace-nowrap">
                          {attendee.firstName} {attendee.lastName}
                        </td>
                        <td className="p-5 text-muted-foreground font-medium">{attendee.email}</td>
                        <td className="p-5">
                          {attendee.preRegistered ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800 border-2 border-green-800">
                              Pre-Registered
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800 border-2 border-yellow-800">
                              Walk-in
                            </span>
                          )}
                        </td>
                        <td className="p-5">
                          {attendee.roles && attendee.roles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {attendee.roles.filter(r => r.wantsToServeToday !== false).map((r) => {
                                const meta = (ROLE_META as Record<string, typeof ROLE_META[AttendeeRoleRoleName]>)[r.roleName];
                                return (
                                  <span
                                    key={r.roleName}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border-2 ${meta.color}`}
                                  >
                                    <meta.Icon className="w-3 h-3" />
                                    {meta.label}
                                    {r.isTrained && <span className="ml-1" title="Trained">✓</span>}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50 italic text-sm font-medium">None</span>
                          )}
                        </td>
                        <td className="p-5 text-muted-foreground font-medium whitespace-nowrap">
                          {format(new Date(attendee.checkedInAt), "h:mm a")}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEditOpen(attendee)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Edit attendee"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(attendee.email, `${attendee.firstName} ${attendee.lastName}`)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove attendee"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </main>

      {/* Edit Attendee Modal */}
      {showPrizeWinners && (() => {
        const winners = (data?.attendees ?? []).filter(a => (a as typeof a & { isNoIceWinner?: boolean }).isNoIceWinner);
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setShowPrizeWinners(false)}>
            <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b-4 border-foreground">
                <div>
                  <h3 className="font-display text-2xl">🏅 Prize Winners</h3>
                  <p className="text-sm text-muted-foreground font-medium mt-1">{winners.length} winner{winners.length !== 1 ? "s" : ""} so far</p>
                </div>
                <button onClick={() => setShowPrizeWinners(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {winners.length === 0 ? (
                  <p className="text-muted-foreground text-center font-medium py-8">No winners yet — keep checking people in!</p>
                ) : (
                  <ul className="space-y-3">
                    {winners.map((w, i) => (
                      <li key={w.id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-yellow-300 bg-yellow-50">
                        <span className="font-display text-2xl text-yellow-600 w-8 text-center">{i + 1}.</span>
                        <div>
                          <p className="font-bold text-lg">{w.firstName} {w.lastName}</p>
                          <p className="text-sm text-muted-foreground">{w.email}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-6 border-t-4 border-foreground">
                <p className="text-xs text-muted-foreground font-medium text-center">
                  Winners are told to give their name at the front desk at the end of the rally.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {editingAttendee && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setEditingAttendee(null)}>
          <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b-4 border-foreground">
              <div>
                <h3 className="font-display text-2xl">Edit Attendee</h3>
                <p className="text-sm text-muted-foreground font-medium mt-1">{editingAttendee.email}</p>
              </div>
              <button onClick={() => setEditingAttendee(null)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-display text-sm uppercase tracking-wider mb-1 block">First Name</label>
                  <input
                    value={editForm.firstName}
                    onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    className="w-full border-2 border-foreground rounded-lg px-3 py-2 font-medium text-base focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="font-display text-sm uppercase tracking-wider mb-1 block">Last Name</label>
                  <input
                    value={editForm.lastName}
                    onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full border-2 border-foreground rounded-lg px-3 py-2 font-medium text-base focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="font-display text-sm uppercase tracking-wider mb-1 block">Email</label>
                <input
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  type="email"
                  className="w-full border-2 border-foreground rounded-lg px-3 py-2 font-medium text-base focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="font-display text-sm uppercase tracking-wider mb-1 block">
                  Phone <span className="font-sans font-medium normal-case text-muted-foreground text-xs">(leave blank to keep existing)</span>
                </label>
                <input
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  type="tel"
                  placeholder="Enter phone number..."
                  className="w-full border-2 border-foreground rounded-lg px-3 py-2 font-medium text-base focus:outline-none focus:border-primary"
                />
              </div>

              {/* Role editing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-display text-sm uppercase tracking-wider">Roles Served</label>
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({
                      ...f,
                      roles: [...f.roles, { roleName: "safety_marshal", wantsToServeToday: true, isTrained: false, hasServed: true, isNew: true }]
                    }))}
                    className="text-xs font-bold border-2 border-foreground rounded-lg px-3 py-1 hover:bg-muted transition-colors"
                  >
                    + Add Role
                  </button>
                </div>
                {editForm.roles.filter(r => !r.isDeleted).length === 0 && (
                  <p className="text-sm text-muted-foreground italic py-2">No roles recorded — use Add Role to add one.</p>
                )}
                <div className="space-y-2">
                  {editForm.roles.map((role, idx) => role.isDeleted ? null : (
                    <div key={idx} className="flex items-center gap-2 p-2 border-2 border-foreground rounded-lg bg-muted/30">
                      <select
                        value={role.roleName}
                        onChange={e => setEditForm(f => ({
                          ...f,
                          roles: f.roles.map((r, i) => i === idx ? { ...r, roleName: e.target.value as AttendeeRoleRoleName } : r)
                        }))}
                        className="flex-1 border-2 border-foreground rounded-md px-2 py-1 text-sm font-medium bg-white focus:outline-none focus:border-primary"
                      >
                        {ALL_ROLES.map(rn => (
                          <option key={rn} value={rn}>{ROLE_META[rn].label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({
                          ...f,
                          roles: f.roles.map((r, i) => i === idx ? { ...r, wantsToServeToday: r.wantsToServeToday === true ? false : true } : r)
                        }))}
                        className={`text-xs font-bold px-2 py-1 rounded-md border-2 transition-colors ${role.wantsToServeToday === true ? "bg-green-100 border-green-700 text-green-800" : "bg-gray-100 border-gray-400 text-gray-600"}`}
                        title="Served today?"
                      >
                        {role.wantsToServeToday === true ? "Served ✓" : "No-show"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({
                          ...f,
                          roles: f.roles.map((r, i) => i === idx ? { ...r, isDeleted: true } : r)
                        }))}
                        className="p-1 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                        title="Remove role"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <Button variant="outline" className="flex-1" onClick={() => setEditingAttendee(null)} disabled={editSaving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSaveEdit} isLoading={editSaving}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const [authed, setAuthed] = useState(() => !!getAdminToken());

  if (authLoading) return null;

  if (!authed && !isSuperadmin) {
    return <LoginGate onLogin={() => setAuthed(true)} />;
  }

  return (
    <>
      {isSuperadmin && (
        <div className="fixed bottom-6 right-6 z-50">
          <Link href="/superadmin">
            <Button size="sm" className="shadow-brutal border-4 border-foreground gap-2">
              <Shield className="w-4 h-4" />
              Admin Panel
            </Button>
          </Link>
        </div>
      )}
      <Dashboard onLogout={isSuperadmin ? () => {} : () => setAuthed(false)} />
    </>
  );
}
