import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import CheckInFlow from "@/pages/checkin";
import AdminDashboard from "@/pages/admin";
import SuperadminPage from "@/pages/superadmin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
    mutations: {
      retry: 1,
    }
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={CheckInFlow} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/superadmin" component={SuperadminPage} />
      <Route path="/:eventSlug" component={CheckInFlow} />
      <Route path="/:eventSlug/admin" component={AdminDashboard} />
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
