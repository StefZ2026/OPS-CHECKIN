import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import QRCode from "qrcode";
import {
  Search, Users, UserCheck, UserPlus, RefreshCw,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Shield, Activity, HeartHandshake, Megaphone,
  Download, LogOut, Lock, Upload, QrCode, Printer, CheckCircle2,
  Eye, EyeOff, Trash2, Info, HardHat,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAttendees } from "@/hooks/use-attendees";
import { getAdminToken, setAdminToken, clearAdminToken, loginAdmin } from "@/hooks/use-admin-auth";
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
              <p className="text-muted-foreground font-medium">ICU No Kings 3 Rally</p>
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

function CsvUploadSection() {
  const [csvText, setCsvText] = useState("");
  const [status, setStatus] = useState<null | { inserted: number; skipped: number; totalInDatabase: number }>(null);
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
    setError(""); setLoading(true); setStatus(null);
    try {
      const res = await fetch("/api/admin/upload-registrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAdminToken() ?? ""}`,
        },
        body: JSON.stringify({ csv: csvText }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Upload failed");
      }
      const d = await res.json() as { inserted: number; skipped: number; totalInDatabase: number };
      setStatus(d);
      setCsvText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
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
      </CardContent>
    </Card>
  );
}

function QrCodeSection() {
  const [url, setUrl] = useState(window.location.origin + "/");
  const [qrDataUrl, setQrDataUrl] = useState("");

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
      <html><head><title>NK3 Check-In QR Code</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 28px; margin-bottom: 8px; }
        p { font-size: 16px; color: #555; margin-bottom: 24px; }
        img { width: 300px; height: 300px; }
        .url { font-size: 13px; color: #888; margin-top: 16px; word-break: break-all; }
      </style></head>
      <body>
        <h1>No Kings 3 Rally — Check-In</h1>
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

function VolunteerUploadSection() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<null | { inserted: number; skipped: number; totalInDatabase: number; invalidRows?: number[] }>(null);
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
        const parsed = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
        setRows(parsed);
      } catch {
        setError("Could not read file. Please make sure it's a valid Excel (.xlsx) file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (rows.length === 0) { setError("Please select an Excel file first."); return; }
    setError(""); setLoading(true); setStatus(null);
    try {
      const res = await fetch("/api/admin/upload-volunteers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAdminToken() ?? ""}`,
        },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json() as { inserted?: number; skipped?: number; totalInDatabase?: number; error?: string; invalidRows?: number[] };
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setStatus({ inserted: d.inserted ?? 0, skipped: d.skipped ?? 0, totalInDatabase: d.totalInDatabase ?? 0, invalidRows: d.invalidRows });
      setRows([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
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
          This replaces the existing volunteer list each time.
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
              {(status as { duplicatesRemoved?: number }).duplicatesRemoved > 0 && (
                <p className="text-blue-700 text-xs font-medium mt-1">
                  {(status as { duplicatesRemoved?: number }).duplicatesRemoved} duplicate name{(status as { duplicatesRemoved?: number }).duplicatesRemoved === 1 ? "" : "s"} removed automatically.
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
      </CardContent>
    </Card>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const { data, isLoading, isError, refetch, isRefetching } = useAttendees();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("checkedInAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedRole, setSelectedRole] = useState<AttendeeRoleRoleName | null>(null);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleExport = () => {
    const token = getAdminToken();
    const url = "/api/admin/export";
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "");
    const fetchAndDownload = async () => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.click();
      URL.revokeObjectURL(objectUrl);
    };
    fetchAndDownload().catch(console.error);
  };

  const handleLogout = () => {
    clearAdminToken();
    onLogout();
  };

  const handleDelete = async (email: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the roster? This cannot be undone.`)) return;
    try {
      const res = await fetch("/api/admin/attendees", {
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
    const serving = (data?.attendees ?? []).filter((a) => a.roles.some((r) => r.roleName === role));
    const trained = serving.filter((a) => a.roles.some((r) => r.roleName === role && r.isTrained));
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
              <p className="text-lg text-gray-300 font-medium">ICU No Kings 3 Rally · March 28th</p>
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
              variant="secondary"
              onClick={handleExport}
              disabled={isLoading}
            >
              <Download className="w-5 h-5 mr-2" />
              Export CSV
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
          const volunteers = (data?.attendees ?? []).filter(a => a.roles.some(r => r.roleName === selectedRole));
          return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setSelectedRole(null)}>
              <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b-4 border-foreground">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg border-2 border-foreground ${meta.color}`}>
                      <meta.Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-display text-2xl">{meta.label}</h3>
                    <span className="font-display text-xl text-muted-foreground">({volunteers.length})</span>
                  </div>
                  <button onClick={() => setSelectedRole(null)} className="text-muted-foreground hover:text-foreground text-2xl font-bold leading-none">×</button>
                </div>
                <div className="overflow-y-auto flex-1 p-4">
                  {volunteers.length === 0 ? (
                    <p className="text-center text-muted-foreground font-medium py-8">No volunteers signed up yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {volunteers.map(a => {
                        const roleEntry = a.roles.find(r => r.roleName === selectedRole);
                        return (
                          <li key={a.id} className="flex items-center justify-between p-3 rounded-lg border-2 border-border hover:bg-muted/30">
                            <div>
                              <p className="font-bold">{a.firstName} {a.lastName}</p>
                              <p className="text-sm text-muted-foreground">{a.email}</p>
                            </div>
                            {roleEntry?.isTrained && (
                              <span className="text-xs font-bold text-primary border-2 border-primary rounded-full px-2 py-1">Trained ✓</span>
                            )}
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
                              Mobilize
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
                              {attendee.roles.map((r) => {
                                const meta = ROLE_META[r.roleName];
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
                          <button
                            onClick={() => handleDelete(attendee.email, `${attendee.firstName} ${attendee.lastName}`)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove attendee"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
    </div>
  );
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(() => !!getAdminToken());

  if (!authed) {
    return <LoginGate onLogin={() => setAuthed(true)} />;
  }

  return <Dashboard onLogout={() => setAuthed(false)} />;
}
