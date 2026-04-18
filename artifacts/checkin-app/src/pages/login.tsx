import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authLogin, authSetPassword, redirectByRole, type AuthUser } from "@/hooks/use-auth";
import Logo from "@/components/Logo";

interface Props {
  onLogin: (user: AuthUser) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // First-time password setup state
  const [firstLogin, setFirstLogin] = useState(false);
  const [firstLoginEmail, setFirstLoginEmail] = useState("");
  const [firstLoginName, setFirstLoginName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { status, data } = await authLogin(email.trim(), password);
      if (data.firstLogin) {
        setFirstLogin(true);
        setFirstLoginEmail(data.email as string);
        setFirstLoginName(data.name as string);
        return;
      }
      if (status !== 200) {
        setError((data.error as string) || "Login failed");
        return;
      }
      const user = data.user as AuthUser;
      onLogin(user);
      redirectByRole(user, setLocation);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const { status, data } = await authSetPassword(firstLoginEmail, newPassword);
      if (status !== 200) {
        setError((data.error as string) || "Failed to set password");
        return;
      }
      const user = data.user as AuthUser;
      onLogin(user);
      redirectByRole(user, setLocation);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (firstLogin) {
    return (
      <div className="min-h-screen bg-foreground flex items-center justify-center p-6">
        <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-md p-8">
          <div className="flex items-center gap-3 mb-6">
            <Logo className="w-10 h-10" />
            <div>
              <h1 className="font-display text-xl">Welcome, {firstLoginName}</h1>
              <p className="text-sm text-muted-foreground">Set your password to continue</p>
            </div>
          </div>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-blue-800">
            You've been added to OpsCheckIn. Please set a password to activate your account.
          </p>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1">New Password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" required />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1">Confirm Password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" required />
            </div>
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Setting password…" : "Set Password & Sign In"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-foreground flex items-center justify-center p-6">
      <div className="bg-white border-4 border-foreground rounded-2xl shadow-brutal-lg w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-8">
          <Logo className="w-12 h-12" />
          <div>
            <h1 className="font-display text-2xl">OpsCheckIn</h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            <Lock className="w-4 h-4 mr-2" />
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
        <p className="text-xs text-center text-muted-foreground mt-6">
          Checking in to an event?{" "}
          <Link href="/" className="underline">Enter your event code</Link>
        </p>
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-center">
          <Link href="/superadmin">
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <Shield className="w-3 h-3" />
              Platform Admin
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

