import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Settings, Camera, Globe, Instagram, Twitter, Facebook, Phone, MapPin, Mail, User, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import SiteShell from "@/components/SiteShell";

interface OrgProfile {
  id: number;
  name: string;
  slug: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  logoUrl: string | null;
}

interface Props {
  currentUser: AuthUser;
}

function Field({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function OrgSettings({ currentUser }: Props) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const orgId = currentUser.orgId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    contactName: "",
    contactEmail: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    website: "",
    instagramUrl: "",
    twitterUrl: "",
    facebookUrl: "",
    logoUrl: "",
  });

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  useEffect(() => {
    if (!orgId) return;
    void fetch(`/api/orgs/${orgId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: OrgProfile) => {
        setForm({
          name: data.name ?? "",
          contactName: data.contactName ?? "",
          contactEmail: data.contactEmail ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          zip: data.zip ?? "",
          website: data.website ?? "",
          instagramUrl: data.instagramUrl ?? "",
          twitterUrl: data.twitterUrl ?? "",
          facebookUrl: data.facebookUrl ?? "",
          logoUrl: data.logoUrl ?? "",
        });
        setLogoPreview(data.logoUrl ?? null);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      toast({ title: "Image too large", description: "Please use an image under 1 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setForm((f) => ({ ...f, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          contactName: form.contactName || null,
          contactEmail: form.contactEmail || null,
          phone: form.phone || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          website: form.website || null,
          instagramUrl: form.instagramUrl || null,
          twitterUrl: form.twitterUrl || null,
          facebookUrl: form.facebookUrl || null,
          logoUrl: form.logoUrl || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed to save");
      }
      toast({ title: "Settings saved", description: "Your organization profile has been updated." });
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SiteShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground animate-pulse">Loading settings…</p>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/org")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-primary text-white rounded-xl border-4 border-foreground shadow-brutal">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl">Organization Settings</h1>
            <p className="text-muted-foreground text-sm font-medium">Manage your profile, contact info, and branding</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">

          {/* Logo */}
          <Card className="border-4 border-foreground shadow-brutal">
            <CardContent className="p-6">
              <h2 className="font-display text-xl mb-4">Logo</h2>
              <div className="flex items-center gap-6">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-2xl border-4 border-foreground bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity shadow-brutal"
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Camera className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Upload your organization's logo</p>
                  <p className="text-xs text-muted-foreground mb-3">PNG or JPG, max 1 MB. Shown on your dashboard and event pages.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {logoPreview ? "Change Logo" : "Upload Logo"}
                  </Button>
                  {logoPreview && (
                    <button
                      type="button"
                      onClick={() => { setLogoPreview(null); setForm((f) => ({ ...f, logoUrl: "" })); }}
                      className="ml-3 text-xs text-muted-foreground underline hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoFile}
              />
              <div className="mt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Or paste an image URL</label>
                <Input
                  value={form.logoUrl.startsWith("data:") ? "" : form.logoUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setForm((f) => ({ ...f, logoUrl: url }));
                    setLogoPreview(url || null);
                  }}
                  placeholder="https://yoursite.com/logo.png"
                />
              </div>
            </CardContent>
          </Card>

          {/* Organization info */}
          <Card className="border-4 border-foreground shadow-brutal">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-display text-xl">Organization Info</h2>
              <Field label="Organization Name" icon={Settings} value={form.name} onChange={set("name")} placeholder="Indivisible Cherokee United" />
              <Field label="Website" icon={Globe} value={form.website} onChange={set("website")} placeholder="https://yourorg.org" type="url" />
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="border-4 border-foreground shadow-brutal">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-display text-xl">Primary Contact</h2>
              <Field label="Contact Name" icon={User} value={form.contactName} onChange={set("contactName")} placeholder="Jane Smith" />
              <Field label="Contact Email" icon={Mail} value={form.contactEmail} onChange={set("contactEmail")} placeholder="jane@yourorg.org" type="email" />
              <Field label="Phone" icon={Phone} value={form.phone} onChange={set("phone")} placeholder="(404) 555-0100" type="tel" />
            </CardContent>
          </Card>

          {/* Address */}
          <Card className="border-4 border-foreground shadow-brutal">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-display text-xl">Address</h2>
              <Field label="Street Address" icon={MapPin} value={form.address} onChange={set("address")} placeholder="123 Main St" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="City" icon={MapPin} value={form.city} onChange={set("city")} placeholder="Canton" />
                <Field label="State" icon={MapPin} value={form.state} onChange={set("state")} placeholder="GA" />
              </div>
              <Field label="ZIP Code" icon={MapPin} value={form.zip} onChange={set("zip")} placeholder="30114" />
            </CardContent>
          </Card>

          {/* Social */}
          <Card className="border-4 border-foreground shadow-brutal">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-display text-xl">Social Media</h2>
              <Field label="Instagram" icon={Instagram} value={form.instagramUrl} onChange={set("instagramUrl")} placeholder="https://instagram.com/yourorg" type="url" />
              <Field label="Twitter / X" icon={Twitter} value={form.twitterUrl} onChange={set("twitterUrl")} placeholder="https://twitter.com/yourorg" type="url" />
              <Field label="Facebook" icon={Facebook} value={form.facebookUrl} onChange={set("facebookUrl")} placeholder="https://facebook.com/yourorg" type="url" />
            </CardContent>
          </Card>

          <div className="flex gap-4 pb-8">
            <Button type="submit" isLoading={saving} size="xl" className="flex-1">
              <Save className="w-5 h-5 mr-2" />
              {saving ? "Saving…" : "Save Settings"}
            </Button>
            <Button type="button" variant="outline" size="xl" onClick={() => setLocation("/org")}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </SiteShell>
  );
}
