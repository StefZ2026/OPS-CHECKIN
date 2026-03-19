import { useState } from "react";
import { format } from "date-fns";
import { Search, Users, UserCheck, UserPlus, Download, RefreshCw } from "lucide-react";
import { useAttendees } from "@/hooks/use-attendees";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminDashboard() {
  const { data, isLoading, isError, refetch, isRefetching } = useAttendees();
  const [search, setSearch] = useState("");

  const formatRoleName = (role: string) => {
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const filteredAttendees = data?.attendees.filter(a => 
    a.firstName.toLowerCase().includes(search.toLowerCase()) || 
    a.lastName.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

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
            <img src="/icu-logo.jpg" alt="ICU" className="w-14 h-14 rounded-full object-cover border-4 border-white hidden md:block" />
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
              <RefreshCw className={`w-5 h-5 mr-2 ${isRefetching ? 'animate-spin' : ''}`} /> 
              Refresh
            </Button>
            <Button variant="secondary" className="border-white shadow-[4px_4px_0_0_#fff]">
              <Download className="w-5 h-5 mr-2" /> Export CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-12 space-y-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="bg-primary text-white border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-primary-foreground/80 font-bold text-lg uppercase tracking-wider mb-2">Total Checked In</p>
                <p className="font-display text-6xl md:text-7xl">{isLoading ? "-" : data?.total}</p>
              </div>
              <Users className="w-16 h-16 opacity-50" />
            </CardContent>
          </Card>
          
          <Card className="bg-secondary text-foreground border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-foreground/80 font-bold text-lg uppercase tracking-wider mb-2">Pre-Registered</p>
                <p className="font-display text-6xl md:text-7xl">{isLoading ? "-" : data?.preRegisteredCount}</p>
              </div>
              <UserCheck className="w-16 h-16 opacity-50" />
            </CardContent>
          </Card>

          <Card className="bg-white text-foreground border-black">
            <CardContent className="p-8 flex items-center justify-between">
              <div>
                <p className="text-muted-foreground font-bold text-lg uppercase tracking-wider mb-2">Walk-ins</p>
                <p className="font-display text-6xl md:text-7xl">{isLoading ? "-" : data?.walkInCount}</p>
              </div>
              <UserPlus className="w-16 h-16 opacity-20" />
            </CardContent>
          </Card>
        </div>

        {/* List Section */}
        <div className="space-y-6">
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
                    <th className="p-6">Name</th>
                    <th className="p-6">Email</th>
                    <th className="p-6">Type</th>
                    <th className="p-6">Volunteer Roles</th>
                    <th className="p-6">Check-in Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-xl font-bold text-muted-foreground">
                        Loading roster...
                      </td>
                    </tr>
                  ) : filteredAttendees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-xl font-bold text-muted-foreground">
                        No attendees found.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendees.map((attendee) => (
                      <tr key={attendee.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-6 font-bold text-lg">{attendee.firstName} {attendee.lastName}</td>
                        <td className="p-6 text-muted-foreground font-medium">{attendee.email}</td>
                        <td className="p-6">
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
                        <td className="p-6">
                          {attendee.roles && attendee.roles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {attendee.roles.map(r => (
                                <span key={r.roleName} className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-gray-100 border-2 border-gray-300">
                                  {formatRoleName(r.roleName)}
                                  {r.isTrained && <span className="text-primary ml-1" title="Trained">✓</span>}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50 italic text-sm font-medium">None</span>
                          )}
                        </td>
                        <td className="p-6 text-muted-foreground font-medium whitespace-nowrap">
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
