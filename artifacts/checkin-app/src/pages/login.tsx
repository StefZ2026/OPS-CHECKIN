import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authLogin, authSetPassword, redirectByRole, type AuthUser } from "@/hooks/use-auth";
import Logo from "@/components/Logo";

interface Props {
  onLogin: (user: AuthUser) => void;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

export default function LoginPage({ onLogin }: Props) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1">Confirm Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
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
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Email or Username</label>
            <Input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com or username"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider">Password</label>
              <a
                href="mailto:info@opscheckin.com?subject=Password%20Reset%20Request"
                className="text-xs text-muted-foreground hover:text-primary transition-colors underline"
              >
                Forgot your password?
              </a>
            </div>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
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
      </div>
    </div>
  );
}
