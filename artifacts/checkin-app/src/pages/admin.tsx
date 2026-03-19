import { useState } from "react";
import { format } from "date-fns";
import { Search, Users, UserCheck, UserPlus, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, Shield, Activity, HeartHandshake, Megaphone } from "lucide-react";
import { useAttendees } from "@/hooks/use-attendees";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AttendeeWithRoles, AttendeeRoleRoleName } from "@workspace/api-client-react";

type SortKey = "name" | "email" | "type" | "checkedInAt";
type SortDir = "asc" | "desc";

const ROLE_META: Record<AttendeeRoleRoleName, { label: string; Icon: React.ElementType; color: string }> = {
  safety_marshal: { label: "Safety Marshal", Icon: Shield, color: "bg-blue-100 text-blue-800 border-blue-800" },
  medic: { label: "Medic", Icon: Activity, color: "bg-red-100 text-red-800 border-red-800" },
  de_escalator: { label: "De-escalator", Icon: HeartHandshake, color: "bg-purple-100 text-purple-800 border-purple-800" },
  chant_lead: { label: "Chant Lead", Icon: Megaphone, color: "bg-yellow-100 text-yellow-800 border-yellow-800" },
};

const ALL_ROLES: AttendeeRoleRoleName[] = ["safety_marshal", "medic", "de_escalator", "chant_lead"];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-4 h-4 opacity-40 inline ml-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-4 h-4 inline ml-1" />
    : <ChevronDown className="w-4 h-4 inline ml-1" />;
}

export default function AdminDashboard() {
  const { data, isLoading, isError, refetch, isRefetching } = useAttendees();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("checkedInAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
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
      {/* Header */}
      <header className="bg-foreground text-white py-6 px-6 md:px-12 sticky top-0 z-20 border-b-8 border-primary">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img src="/icu-logo.jpg" alt="ICU" className="w-14 h-14 rounded-full object-cover hidden md:block" />
            <div>
              <h1 className="font-display text-3xl md:text-5xl mb-1 text-white">Command Center</h1>
              <p className="text-lg text-gray-300 font-medium">ICU No Kings 3 Rally · March 28th</p>
            </div>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <Button
              variant="outline"
              className="bg-transparent border-white text-white hover:bg-white/10 hover:text-white"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
              Refresh
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

        {/* Role Breakdown */}
        <div>
          <h2 className="font-display text-2xl mb-4">Volunteer Role Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {roleCounts.map(({ role, count, trained }) => {
              const meta = ROLE_META[role];
              return (
                <Card key={role} className="border-2 border-foreground">
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
                      <td colSpan={5} className="p-12 text-center text-xl font-bold text-muted-foreground">
                        Loading roster...
                      </td>
                    </tr>
                  ) : filteredAndSorted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-xl font-bold text-muted-foreground">
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
