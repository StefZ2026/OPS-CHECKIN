import { Link, useLocation } from "wouter";
import { Shield, LogOut } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth, authLogout } from "@/hooks/use-auth";

interface Props {
  children: React.ReactNode;
}

export default function SiteShell({ children }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const showAdminLink =
    user?.role === "superadmin" || !!sessionStorage.getItem("sa_active");

  const handleLogout = async () => {
    await authLogout();
    setLocation("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      <nav className="border-b-4 border-foreground bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <Logo className="h-9 w-auto cursor-pointer" variant="color" />
          </Link>

          <div className="flex items-center gap-3">
            {showAdminLink && (
              <Link href="/superadmin">
                <button className="flex items-center gap-1.5 text-sm font-display uppercase tracking-wide border-2 border-primary text-primary px-3 py-1.5 hover:bg-primary hover:text-white transition-all">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">Platform Admin</span>
                </button>
              </Link>
            )}

            {user ? (
              <>
                <span className="text-sm font-medium text-muted-foreground hidden md:block">{user.name}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-medium border-2 border-foreground/40 px-3 py-1.5 hover:bg-foreground hover:text-white transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="bg-foreground text-white font-display text-sm uppercase tracking-wider px-5 py-2 border-2 border-foreground shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal transition-all"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="flex-1">
        {children}
      </div>

      <footer className="bg-foreground border-t-4 border-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo className="h-7 w-auto" variant="white" />
          <p className="text-white/50 text-xs text-center">
            Show Up. Check In. Get to Work. © {new Date().getFullYear()} OpsCheckIn
          </p>
          <div className="flex gap-4 text-xs">
            <a href="mailto:info@opscheckin.com" className="text-white/60 hover:text-white transition-colors">
              Contact
            </a>
            <Link href="/privacy" className="text-white/60 hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-white/60 hover:text-white transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
