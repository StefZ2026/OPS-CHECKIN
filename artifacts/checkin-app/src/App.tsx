import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginPage from "@/pages/login";
import HomePage from "@/pages/home";
import OrgDashboard from "@/pages/org-dashboard";
import OrgSettings from "@/pages/org-settings";
import CheckInFlow from "@/pages/checkin";
import AdminDashboard from "@/pages/admin";
import SuperadminPage from "@/pages/superadmin";
import EntryPage from "@/pages/entry";
import ScanPage from "@/pages/scan";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import NotFound from "@/pages/not-found";
import { useAuth, redirectByRole, type AuthUser } from "@/hooks/use-auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 },
    mutations: { retry: 1 },
  },
});

function RedirectToRole({ user }: { user: AuthUser }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    redirectByRole(user, setLocation);
  }, [user, setLocation]);
  return null;
}

function Router() {
  const { user, loading, refetch } = useAuth();

  const handleLogin = (_u: AuthUser) => {
    refetch().catch(() => {});
  };

  const handleLogout = () => {
    refetch().catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-foreground flex items-center justify-center">
        <div className="text-white font-display text-xl animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={HomePage} />

      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />

      <Route path="/login" component={() => <LoginPage onLogin={handleLogin} />} />

      <Route path="/org/settings">
        {user && (user.role === "org_contact" || user.role === "superadmin") ? (
          <OrgSettings currentUser={user} />
        ) : (
          <LoginPage onLogin={handleLogin} />
        )}
      </Route>

      <Route path="/org">
        {user && (user.role === "org_contact" || user.role === "superadmin") ? (
          <OrgDashboard currentUser={user} onLogout={handleLogout} />
        ) : (
          <LoginPage onLogin={handleLogin} />
        )}
      </Route>

      <Route path="/superadmin" component={SuperadminPage} />

      <Route path="/admin" component={AdminDashboard} />

      <Route path="/:eventSlug/entry/:token" component={EntryPage} />
      <Route path="/:eventSlug/scan" component={ScanPage} />
      <Route path="/:eventSlug/admin" component={AdminDashboard} />
      <Route path="/:eventSlug" component={CheckInFlow} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
