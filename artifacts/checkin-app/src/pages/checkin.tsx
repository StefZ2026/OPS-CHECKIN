import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { UserPlus, Mail, Phone, Shield, Activity, HeartHandshake, Megaphone, CheckCircle, ArrowRight, ArrowLeft, PartyPopper, HardHat, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAttendeeLookup, useCheckInSubmit } from "@/hooks/use-checkin";
import type { AttendeeRoleRoleName, VolunteerPreRegResult } from "@workspace/api-client-react";

type RoleState = {
  roleName: AttendeeRoleRoleName;
  title: string;
  Icon: React.ElementType;
  hasServed: boolean;
  isTrained: boolean;
  wantsToServeToday: boolean | null;
};

const ROLE_DEFS: Pick<RoleState, "roleName" | "title" | "Icon">[] = [
  { roleName: "safety_marshal", title: "Safety Marshal", Icon: Shield },
  { roleName: "medic",          title: "Medic",           Icon: Activity },
  { roleName: "de_escalator",   title: "De-escalator",    Icon: HeartHandshake },
  { roleName: "chant_lead",     title: "Chant Lead",      Icon: Megaphone },
];

const ROLE_META: Record<AttendeeRoleRoleName, { title: string; Icon: React.ElementType; hasVest: boolean }> = {
  safety_marshal:      { title: "Safety Marshal",      Icon: Shield,        hasVest: true },
  medic:               { title: "Medic",               Icon: Activity,      hasVest: true },
  de_escalator:        { title: "De-escalator",        Icon: HeartHandshake, hasVest: true },
  chant_lead:          { title: "Chant Lead",          Icon: Megaphone,     hasVest: true },
  information_services:{ title: "Information Services", Icon: Info,          hasVest: false },
};

function makeInitialRoles(): RoleState[] {
  return ROLE_DEFS.map(d => ({ ...d, hasServed: false, isTrained: false, wantsToServeToday: null }));
}

function useIsMobile() {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 || /Mobi|Android|iPhone|iPod/.test(navigator.userAgent);
  }, []);
}

type Step = 1 | "found" | 2 | 3 | "invite" | "volunteer" | "fun" | "duplicate" | 4
          | "vol_found" | "vol_not_found" | "vol_manual" | "name_confirm" | "dup_name_confirm";

export default function CheckInFlow() {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preRegistered, setPreRegistered] = useState(false);
  const [mobilizeId, setMobilizeId] = useState<string | null>(null);
  const [walkinSource, setWalkinSource] = useState<"not_found" | "direct">("direct");
  const [roles, setRoles] = useState<RoleState[]>(makeInitialRoles());
  const [isVolunteerMode, setIsVolunteerMode] = useState(false);
  const [volunteerPreRegData, setVolunteerPreRegData] = useState<VolunteerPreRegResult | null>(null);
  const [checkedInVolunteerRole, setCheckedInVolunteerRole] = useState<AttendeeRoleRoleName | null>(null);
  const [volunteerManualRole, setVolunteerManualRole] = useState<AttendeeRoleRoleName | null>(null);
  const [isVolunteerManual, setIsVolunteerManual] = useState(false);
  const [preRegName, setPreRegName] = useState<{ firstName: string; lastName: string } | null>(null);
  const [storedName, setStoredName] = useState<{ firstName: string; lastName: string } | null>(null);
  const [storedAttendeeId, setStoredAttendeeId] = useState<number | null>(null);

  const lookupMutation = useAttendeeLookup();
  const submitMutation = useCheckInSubmit();

  const eligibleRoles = roles.filter(r => r.hasServed || r.isTrained);
  const anyEligible = eligibleRoles.length > 0;

  const handleReset = () => {
    setStep(1);
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setPreRegistered(false); setMobilizeId(null);
    setWalkinSource("direct");
    setRoles(makeInitialRoles());
    setIsVolunteerMode(false);
    setVolunteerPreRegData(null);
    setCheckedInVolunteerRole(null);
    setVolunteerManualRole(null);
    setIsVolunteerManual(false);
    setPreRegName(null);
    setStoredName(null);
    setStoredAttendeeId(null);
  };

  const correctStoredName = async (attendeeId: number, newFirst: string, newLast: string) => {
    await fetch("/api/check-in/correct-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId, firstName: newFirst, lastName: newLast }),
    });
  };

  const handleLookup = () => {
    if (!firstName.trim() || !email.trim()) {
      toast({ title: "Hold up!", description: "We need both first name and email.", variant: "destructive" });
      return;
    }
    lookupMutation.mutate({ data: { firstName: firstName.trim(), email: email.trim(), isVolunteer: isVolunteerMode } }, {
      onSuccess: (data) => {
        if (data.alreadyCheckedIn) {
          setStep("duplicate");
          return;
        }

        // Volunteer path
        if (isVolunteerMode) {
          if (data.volunteerPreReg) {
            // Found in volunteer list
            const vpr = data.volunteerPreReg;
            setVolunteerPreRegData(vpr);
            setFirstName(vpr.firstName);
            setLastName(vpr.lastName);
            if (vpr.email) setEmail(vpr.email);
            if (vpr.phone) setPhone(vpr.phone);
            setStep("vol_found");
          } else {
            // Not found in volunteer list
            setStep("vol_not_found");
          }
          return;
        }

        // Regular attendee path
        if (data.found) {
          setPreRegistered(true);
          setMobilizeId(data.mobilizeId ?? null);
          // Check if name on file differs from what they typed
          const d = data as typeof data & { foundFirstName?: string; foundLastName?: string };
          const foundFirst = (d.foundFirstName ?? "").trim().toLowerCase();
          const typedFirst = firstName.trim().toLowerCase();
          if (d.foundFirstName && foundFirst !== typedFirst) {
            setPreRegName({ firstName: d.foundFirstName, lastName: d.foundLastName ?? "" });
            setStep("name_confirm");
          } else {
            setStep("found");
            confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
          }
        } else {
          setPreRegistered(false);
          setWalkinSource("not_found");
          setStep(2);
        }
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to connect. Please proceed as walk-in.", variant: "destructive" });
        setPreRegistered(false);
        setStep(2);
      }
    });
  };

  const submitCheckin = (rolesToSubmit: RoleState[]) => {
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || "Unknown",
      email: email.trim(),
      phone: phone.trim() || null,
      preRegistered,
      mobilizeId,
      roles: rolesToSubmit.filter(r => r.wantsToServeToday).map(r => ({ roleName: r.roleName, isTrained: r.isTrained }))
    };
    submitMutation.mutate({ data: payload }, {
      onSuccess: () => {
        const isVolunteering = rolesToSubmit.some(r => r.wantsToServeToday === true);
        const declinedAll = rolesToSubmit.some(r => (r.hasServed || r.isTrained) && r.wantsToServeToday === false);
        if (isVolunteering) {
          confetti({ particleCount: 250, spread: 140, origin: { y: 0.4 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
          setStep("volunteer");
        } else if (declinedAll) {
          setStep("fun");
        } else {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff'] });
          setStep(4);
        }
      },
      onError: (err) => {
        const msg = (err as { message?: string })?.message ?? "";
        if (msg.toLowerCase().includes("already")) {
          const errData = (err as { data?: { storedFirstName?: string; storedLastName?: string; attendeeId?: number } }).data;
          const sf = errData?.storedFirstName ?? "";
          const sl = errData?.storedLastName ?? "";
          const aid = errData?.attendeeId ?? null;
          if (aid && sf.toLowerCase() !== firstName.trim().toLowerCase()) {
            setStoredName({ firstName: sf, lastName: sl });
            setStoredAttendeeId(aid);
            setStep("dup_name_confirm");
          } else {
            setStep("duplicate");
          }
        } else {
          toast({ title: "Check-in failed", description: msg || "Please try again.", variant: "destructive" });
        }
      }
    });
  };

  const submitVolunteerCheckin = () => {
    const roleName = volunteerPreRegData!.roleName as AttendeeRoleRoleName;
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || "Volunteer",
      email: email.trim(),
      phone: phone.trim() || null,
      preRegistered: false,
      mobilizeId: null,
      roles: [{ roleName, isTrained: true }],
    };
    submitMutation.mutate({ data: payload }, {
      onSuccess: () => {
        setCheckedInVolunteerRole(roleName);
        confetti({ particleCount: 300, spread: 160, origin: { y: 0.4 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
        setStep(4);
      },
      onError: (err) => {
        const msg = (err as { message?: string })?.message ?? "";
        if (msg.toLowerCase().includes("already")) {
          const errData = (err as { data?: { storedFirstName?: string; storedLastName?: string; attendeeId?: number } }).data;
          const sf = errData?.storedFirstName ?? "";
          const sl = errData?.storedLastName ?? "";
          const aid = errData?.attendeeId ?? null;
          if (aid && sf.toLowerCase() !== firstName.trim().toLowerCase()) {
            setStoredName({ firstName: sf, lastName: sl });
            setStoredAttendeeId(aid);
            setStep("dup_name_confirm");
          } else {
            setStep("duplicate");
          }
        } else {
          toast({ title: "Check-in failed", description: msg || "Please try again.", variant: "destructive" });
        }
      }
    });
  };

  // Auto-advance from "found" to experience step
  useEffect(() => {
    if (step === "found") { const t = setTimeout(() => setStep(3), 3000); return () => clearTimeout(t); }
  }, [step]);

  // Auto-reset after duplicate screen
  useEffect(() => {
    if (step === "duplicate") { const t = setTimeout(handleReset, 7000); return () => clearTimeout(t); }
  }, [step]);

  // Auto-advance from volunteer celebration to YOU'RE IN
  useEffect(() => {
    if (step === "volunteer") { const t = setTimeout(() => setStep(4), 4000); return () => clearTimeout(t); }
  }, [step]);

  // Auto-advance from fun screen to YOU'RE IN
  useEffect(() => {
    if (step === "fun") { const t = setTimeout(() => setStep(4), 5000); return () => clearTimeout(t); }
  }, [step]);

  // Auto-reset after success
  useEffect(() => {
    if (step === 4) { const t = setTimeout(handleReset, 8000); return () => clearTimeout(t); }
  }, [step]);

  const submitVolunteerManualCheckin = () => {
    if (!volunteerManualRole) {
      toast({ title: "Hold up!", description: "Please select your volunteer role.", variant: "destructive" });
      return;
    }
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || "Volunteer",
      email: email.trim(),
      phone: phone.trim() || null,
      preRegistered: false,
      mobilizeId: null,
      roles: [{ roleName: volunteerManualRole, isTrained: true }],
    };
    submitMutation.mutate({ data: payload }, {
      onSuccess: () => {
        setCheckedInVolunteerRole(volunteerManualRole);
        setIsVolunteerManual(true);
        confetti({ particleCount: 300, spread: 160, origin: { y: 0.4 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
        setStep(4);
      },
      onError: (err) => {
        const msg = (err as { message?: string })?.message ?? "";
        if (msg.toLowerCase().includes("already")) {
          setStep("duplicate");
        } else {
          toast({ title: "Check-in failed", description: msg || "Please try again.", variant: "destructive" });
        }
      }
    });
  };

  const updateRole = (id: AttendeeRoleRoleName, updates: Partial<RoleState>) => {
    setRoles(prev => prev.map(r => {
      if (r.roleName !== id) return r;
      const next = { ...r, ...updates };
      if (!next.hasServed && !next.isTrained) next.wantsToServeToday = null;
      return next;
    }));
  };

  const showBackButton = step === 2 || step === 3 || step === "invite" || step === "vol_found" || step === "vol_not_found" || step === "vol_manual";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-white">
      {/* Header */}
      <header className="py-4 px-6 md:px-12 border-b-4 border-foreground bg-foreground flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <img src="/icu-logo.jpg" alt="Indivisible Cherokee United" className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover" />
          <div>
            <h1 className="font-display text-xl md:text-3xl text-white leading-tight">No Kings 3 Rally</h1>
            <p className="text-white/70 text-sm font-medium hidden md:block">March 28th · ICU Check-In</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <img src="/nk3-banner.png" alt="No Kings" className="h-12 md:h-14 w-auto object-contain flex-shrink-0" />
          {showBackButton && (
            <Button variant="outline" size="sm"
              className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                if (step === "invite") setStep(3);
                else if (step === 3) setStep(preRegistered ? 1 : 2);
                else if (step === "vol_found" || step === "vol_not_found") { setVolunteerPreRegData(null); setStep(1); }
                else if (step === "vol_manual") { setVolunteerManualRole(null); setStep("vol_not_found"); }
                else setStep(1);
              }}
            >
              <ArrowLeft className="w-5 h-5 mr-2" /> Back
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-6 md:p-12 flex flex-col justify-center">
        <AnimatePresence mode="wait" initial={false}>

          {/* STEP 1: LOOKUP */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-4 mb-8">
                <h2 className="font-display text-5xl md:text-7xl text-primary">Welcome!</h2>
                <p className="text-2xl md:text-3xl font-medium text-muted-foreground">Let's get you checked in to the rally.</p>
              </div>

              {/* Volunteer toggle */}
              <button
                onClick={() => setIsVolunteerMode(v => !v)}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border-4 transition-all text-left
                  ${isVolunteerMode
                    ? 'border-primary bg-primary/10 shadow-brutal-sm'
                    : 'border-foreground bg-white hover:bg-muted/30'}`}
              >
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl border-4 border-foreground flex items-center justify-center transition-colors
                  ${isVolunteerMode ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}>
                  <HardHat className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className={`font-display text-xl leading-tight ${isVolunteerMode ? 'text-primary' : 'text-foreground'}`}>
                    I'm checking in as a <strong>volunteer</strong> today
                  </p>
                  <p className="text-sm font-medium text-muted-foreground mt-1">
                    {isVolunteerMode ? "✓ Volunteer mode ON — we'll look you up in our volunteer list" : "Tap to activate if you're on the volunteer team"}
                  </p>
                </div>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full border-4 border-foreground flex items-center justify-center
                  ${isVolunteerMode ? 'bg-primary' : 'bg-white'}`}>
                  {isVolunteerMode && <div className="w-3 h-3 rounded-full bg-white" />}
                </div>
              </button>

              <div className="space-y-6">
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">First Name</label>
                  <Input placeholder="Enter your first name" icon={<UserPlus className="w-8 h-8" />}
                    value={firstName} onChange={(e) => setFirstName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()} autoFocus />
                </div>
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">Email Address</label>
                  <Input placeholder="Enter your email" type="email" icon={<Mail className="w-8 h-8" />}
                    value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <Button size="xl" className="w-full group" onClick={handleLookup} isLoading={lookupMutation.isPending}>
                  {isVolunteerMode ? "Look Me Up →" : "Find My Pre-Registration"} <ArrowRight className="ml-3 w-7 h-7 group-hover:translate-x-1 transition-transform" />
                </Button>
                {!isVolunteerMode && (
                  <Button size="xl" variant="secondary" className="w-full group border-4 border-foreground shadow-brutal"
                    onClick={() => {
                      if (!firstName.trim() || !email.trim()) {
                        toast({ title: "Hold up!", description: "We need your first name and email first.", variant: "destructive" }); return;
                      }
                      setPreRegistered(false); setWalkinSource("direct"); setStep(2);
                    }}>
                    Register Me <UserPlus className="ml-3 w-7 h-7" />
                  </Button>
                )}
              </div>
              <p className="text-center text-muted-foreground font-medium text-base mt-3">
                {isVolunteerMode
                  ? "We'll check our volunteer list — enter your first name and the email you registered with."
                  : "Pre-registered on Mobilize? Use the first button. New to the rally? Use the second."}
              </p>
            </motion.div>
          )}

          {/* FOUND: Pre-reg celebration */}
          {step === "found" && (
            <motion.div key="found" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }} className="w-full max-w-2xl mx-auto text-center space-y-8 py-8">
              <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: [0,-10,10,-5,5,0], scale: 1 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1 }} className="text-[8rem] md:text-[10rem] leading-none select-none">😄</motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-4">
                <h2 className="font-display text-5xl md:text-7xl text-primary leading-none">WE FOUND YOU!</h2>
                <p className="font-display text-3xl md:text-5xl text-foreground leading-tight">WELCOME TO<br />NO KINGS 3, {firstName.toUpperCase()}!</p>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                className="flex items-center justify-center gap-3 text-muted-foreground font-bold text-lg">
                <PartyPopper className="w-6 h-6 text-primary" />
                <span>You're pre-registered — continuing in a moment…</span>
                <PartyPopper className="w-6 h-6 text-primary" />
              </motion.div>
            </motion.div>
          )}

          {/* VOL_FOUND: Volunteer found in pre-reg list */}
          {step === "vol_found" && volunteerPreRegData && (
            <motion.div key="vol_found" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-3">
                <div className="text-6xl md:text-7xl">🙌</div>
                <h2 className="font-display text-4xl md:text-6xl text-primary leading-none">WE'VE GOT YOU!</h2>
                <p className="text-xl font-medium text-muted-foreground">We have you registered as:</p>
              </div>

              {/* Role badge */}
              {(() => {
                const roleName = volunteerPreRegData.roleName as AttendeeRoleRoleName;
                const meta = ROLE_META[roleName] ?? { title: volunteerPreRegData.roleName, Icon: HardHat, hasVest: false };
                return (
                  <div className="flex items-center justify-center gap-4 p-6 bg-primary/10 border-4 border-primary rounded-2xl">
                    <div className="p-4 bg-primary rounded-2xl border-4 border-foreground shadow-brutal-sm">
                      <meta.Icon className="w-10 h-10 text-white" />
                    </div>
                    <div>
                      <p className="font-display text-4xl md:text-5xl text-primary">{meta.title}</p>
                      <p className="font-bold text-muted-foreground">NK3 Volunteer</p>
                    </div>
                  </div>
                );
              })()}

              {/* Info confirmation */}
              <Card className="border-2 border-foreground">
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-display text-xl">Your Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-green-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-green-600 font-bold text-sm">✓</span>
                      </div>
                      <span className="font-bold text-lg">{firstName} {lastName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-green-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-green-600 font-bold text-sm">✓</span>
                      </div>
                      <span className="font-medium text-muted-foreground">{email}</span>
                    </div>
                    {volunteerPreRegData.phone ? (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-green-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 font-bold text-sm">✓</span>
                        </div>
                        <span className="font-medium text-muted-foreground">{phone || volunteerPreRegData.phone}</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-yellow-100 border-2 border-yellow-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-yellow-600 font-bold text-sm">?</span>
                          </div>
                          <span className="font-medium text-muted-foreground">Phone number missing — add it below</span>
                        </div>
                        <Input placeholder="Phone number (optional)" type="tel" icon={<Phone className="w-6 h-6" />}
                          value={phone} onChange={(e) => setPhone(e.target.value)} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Button size="xl" className="w-full group" onClick={submitVolunteerCheckin} isLoading={submitMutation.isPending}>
                That's me — check me in! <CheckCircle className="ml-4 w-8 h-8" />
              </Button>

              <button
                onClick={() => setStep("vol_manual")}
                className="w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors py-2">
                Something's not right — let me correct my info
              </button>
            </motion.div>
          )}

          {/* VOL_NOT_FOUND: Volunteer not in pre-reg list */}
          {step === "vol_not_found" && (
            <motion.div key="vol_not_found" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8 text-center">
              <div className="text-6xl md:text-7xl">🤔</div>
              <div className="space-y-3">
                <h2 className="font-display text-4xl md:text-5xl leading-tight">Hmm, we couldn't find you<br />in our volunteer list.</h2>
                <p className="text-xl font-medium text-muted-foreground">Did you pre-register to be a volunteer?</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setStep("vol_manual")}
                  className="p-8 rounded-2xl border-4 border-foreground bg-white hover:bg-muted/30 transition-all shadow-brutal text-left space-y-2">
                  <div className="text-4xl">✋</div>
                  <p className="font-display text-2xl">Yes, I pre-registered</p>
                  <p className="text-sm font-medium text-muted-foreground">We'll check you in manually</p>
                </button>
                <button
                  onClick={() => { setIsVolunteerMode(false); setWalkinSource("direct"); setStep(2); }}
                  className="p-8 rounded-2xl border-4 border-primary bg-primary/10 hover:bg-primary/20 transition-all shadow-brutal text-left space-y-2">
                  <div className="text-4xl">🙋</div>
                  <p className="font-display text-2xl text-primary">No, but I'd love to volunteer!</p>
                  <p className="text-sm font-medium text-muted-foreground">We'd love to have you — let's get you set up</p>
                </button>
              </div>
            </motion.div>
          )}

          {/* VOL_MANUAL: Pre-registered but not found — collect info and check in */}
          {step === "vol_manual" && (
            <motion.div key="vol_manual" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-3">
                <div className="text-6xl md:text-7xl">🙌</div>
                <h2 className="font-display text-4xl md:text-6xl text-primary leading-none">GOT YOU!</h2>
                <p className="text-xl font-medium text-muted-foreground">
                  Let's get you checked in, {firstName}. Just a couple quick things:
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">Last Name</label>
                  <Input placeholder="Enter your last name" icon={<UserPlus className="w-8 h-8" />}
                    value={lastName} onChange={(e) => setLastName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">
                    Phone <span className="text-muted-foreground font-sans font-medium normal-case text-base">(optional)</span>
                  </label>
                  <Input placeholder="Enter your phone number" type="tel" icon={<Phone className="w-8 h-8" />}
                    value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">Which role did you sign up for?</label>
                  <div className="grid grid-cols-1 gap-2">
                    {(Object.entries(ROLE_META) as [AttendeeRoleRoleName, typeof ROLE_META[AttendeeRoleRoleName]][]).map(([roleName, meta]) => (
                      <button key={roleName} onClick={() => setVolunteerManualRole(roleName)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                          ${volunteerManualRole === roleName
                            ? 'border-primary bg-primary/10'
                            : 'border-foreground/30 bg-white hover:bg-muted/20'}`}>
                        <meta.Icon className={`w-4 h-4 flex-shrink-0 ${volunteerManualRole === roleName ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`font-bold text-base ${volunteerManualRole === roleName ? 'text-primary' : ''}`}>
                          {meta.title}
                        </span>
                        {volunteerManualRole === roleName && (
                          <span className="ml-auto text-primary font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {volunteerManualRole && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="p-5 bg-primary/10 border-4 border-primary rounded-2xl text-center space-y-1">
                  <p className="font-display text-2xl text-primary">
                    Glad to have you on the {ROLE_META[volunteerManualRole]?.title} team! 🎉
                  </p>
                </motion.div>
              )}

              <Button size="xl" className="w-full" onClick={submitVolunteerManualCheckin} isLoading={submitMutation.isPending}
                disabled={!volunteerManualRole}>
                Check Me In <CheckCircle className="ml-4 w-8 h-8" />
              </Button>
              {!volunteerManualRole && (
                <p className="text-center text-sm text-muted-foreground font-medium">Select your role above to continue</p>
              )}
            </motion.div>
          )}

          {/* STEP 2: ADDITIONAL INFO */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-4 mb-12">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-secondary rounded-full border-4 border-foreground shadow-brutal-sm mb-4">
                  <UserPlus className="w-10 h-10 text-foreground" />
                </div>
                {walkinSource === "direct" ? (
                  <>
                    <h2 className="font-display text-4xl md:text-5xl">Hi {firstName}, welcome!</h2>
                    <p className="text-xl md:text-2xl font-medium text-muted-foreground">Just a little more info and you'll be all set.</p>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-4xl md:text-5xl">No worries, {firstName}!</h2>
                    <p className="text-xl md:text-2xl font-bold text-muted-foreground">We didn't find your pre-registration — but don't sweat it.</p>
                    <p className="text-lg md:text-xl font-medium text-muted-foreground">We can get you checked in and ready to rally in about 2 seconds flat. 🎉</p>
                  </>
                )}
              </div>
              <div>
                <label className="font-display text-xl uppercase tracking-wider mb-2 block">Last Name</label>
                <Input placeholder="Enter your last name" icon={<UserPlus className="w-8 h-8" />}
                  value={lastName} onChange={(e) => setLastName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep(3)} autoFocus />
              </div>
              <div>
                <label className="font-display text-xl uppercase tracking-wider mb-2 block">
                  Phone Number <span className="text-muted-foreground font-sans font-medium normal-case text-base">(optional)</span>
                </label>
                <Input placeholder="Enter your phone number" type="tel" icon={<Phone className="w-8 h-8" />}
                  value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep(3)} />
              </div>
              <Button size="xl" className="w-full mt-8 group" onClick={() => setStep(3)}>
                Continue <ArrowRight className="ml-4 w-8 h-8 group-hover:translate-x-2 transition-transform" />
              </Button>
            </motion.div>
          )}

          {/* STEP 3: EXPERIENCE CHECKBOXES */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-3xl mx-auto space-y-8">
              <div className="text-center space-y-2 mb-4">
                <h2 className="font-display text-4xl md:text-5xl">Volunteer Experience</h2>
                <p className="text-xl font-medium text-muted-foreground">Have you served in or been trained for any of these roles?</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLE_DEFS.map(({ roleName, title, Icon }) => {
                  const role = roles.find(r => r.roleName === roleName)!;
                  const isActive = role.hasServed || role.isTrained;
                  return (
                    <Card key={roleName} className={`transition-all duration-200 ${isActive ? 'ring-4 ring-primary' : ''}`}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`p-3 rounded-xl border-4 border-foreground ${isActive ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <h3 className="font-display text-2xl">{title}</h3>
                        </div>
                        <div className="space-y-2 pl-1">
                          <Checkbox label={`I've served as a ${title} before`} checked={role.hasServed}
                            onChange={(e) => updateRole(roleName, { hasServed: e.target.checked })} />
                          <Checkbox label={`I've received training for this role`} checked={role.isTrained}
                            onChange={(e) => updateRole(roleName, { isTrained: e.target.checked })} />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex flex-col gap-4 pt-4">
                {anyEligible ? (
                  <Button size="xl" className="w-full group" onClick={() => setStep("invite")}>
                    Continue <ArrowRight className="ml-3 w-7 h-7 group-hover:translate-x-1 transition-transform" />
                  </Button>
                ) : (
                  <Button size="xl" className="w-full" onClick={() => submitCheckin(roles)} isLoading={submitMutation.isPending}>
                    None of the above — let's go! →
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* INVITE: Want to serve today? */}
          {step === "invite" && (
            <motion.div key="invite" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-3xl mx-auto space-y-8 pb-4">
              <div className="text-center space-y-2 mb-4">
                <h2 className="font-display text-4xl md:text-5xl text-primary">You're experienced!</h2>
                <p className="text-xl font-medium text-muted-foreground">
                  Would you like to help out today? We'd love to have you — there's a cool NK3 button in it for you! 🎉
                </p>
              </div>

              <div className="space-y-4">
                {eligibleRoles.map(({ roleName, title, Icon, isTrained, wantsToServeToday }) => (
                  <Card key={roleName} className={`transition-all duration-200 ${wantsToServeToday === true ? 'ring-4 ring-primary' : wantsToServeToday === false ? 'opacity-60' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4 mb-5">
                        <div className={`p-4 rounded-xl border-4 border-foreground ${wantsToServeToday ? 'bg-primary text-white' : 'bg-secondary text-foreground'}`}>
                          <Icon className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="font-display text-2xl md:text-3xl">{title}</h3>
                          {isTrained && <p className="text-sm font-bold text-primary">Trained ✓</p>}
                        </div>
                      </div>
                      <p className="font-bold text-lg mb-4">
                        Would you like to serve as a <span className="text-primary">{title}</span> today?
                      </p>
                      <div className="flex gap-3">
                        <button onClick={() => updateRole(roleName, { wantsToServeToday: true })}
                          className={`flex-1 py-3 px-4 rounded-xl border-4 border-foreground font-display text-xl transition-all
                            ${wantsToServeToday === true ? 'bg-primary text-white shadow-brutal-sm' : 'bg-white hover:bg-primary/10'}`}>
                          Yes, I'm in! 🙌
                        </button>
                        <button onClick={() => updateRole(roleName, { wantsToServeToday: false })}
                          className={`flex-1 py-3 px-4 rounded-xl border-4 border-foreground font-display text-xl transition-all
                            ${wantsToServeToday === false ? 'bg-foreground text-white shadow-brutal-sm' : 'bg-white hover:bg-gray-100'}`}>
                          Not today
                        </button>
                      </div>
                      {wantsToServeToday === true && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          className="text-sm font-bold text-primary mt-3">
                          After check-in, come to the table and ask for a member of the safety team — they'll get you sorted!
                        </motion.p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button size="xl" className="w-full mt-4"
                disabled={eligibleRoles.some(r => r.wantsToServeToday === null)}
                onClick={() => submitCheckin(roles)} isLoading={submitMutation.isPending}>
                Complete Check-in <CheckCircle className="ml-4 w-8 h-8" />
              </Button>
              {eligibleRoles.some(r => r.wantsToServeToday === null) && (
                <p className="text-center text-sm text-muted-foreground font-medium">Please answer yes or no for each role above</p>
              )}
            </motion.div>
          )}

          {/* VOLUNTEER: Hooray! */}
          {step === "volunteer" && (
            <motion.div key="volunteer" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }} className="w-full max-w-2xl mx-auto text-center space-y-8 py-8">
              <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: [0,-10,10,-5,5,0], scale: 1 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1 }} className="text-[8rem] md:text-[10rem] leading-none select-none">🦺</motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-4">
                <h2 className="font-display text-5xl md:text-7xl text-primary leading-none">HOORAY!</h2>
                <p className="font-display text-3xl md:text-4xl text-foreground leading-snug">YOU'RE AMAZING,<br />{firstName.toUpperCase()}!</p>
                <div className="border-4 border-primary rounded-2xl bg-primary/5 p-6 mt-4 space-y-2">
                  <p className="font-bold text-xl">Head over to the volunteer table and ask for a member of the safety team.</p>
                  <p className="font-bold text-xl text-primary">They'll get you your vest and your NK3 volunteer button! 🎉</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* NAME_CONFIRM: Name on file differs from what they typed */}
          {step === "name_confirm" && preRegName && (
            <motion.div key="name_confirm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl mx-auto space-y-6">
              <div className="text-center space-y-3">
                <div className="flex justify-center">
                  <div className="p-4 rounded-2xl border-4 border-yellow-500 bg-yellow-50">
                    <AlertCircle className="w-10 h-10 text-yellow-600" />
                  </div>
                </div>
                <h2 className="font-display text-4xl md:text-5xl leading-tight">Quick check!</h2>
                <p className="text-xl font-medium text-muted-foreground">
                  We found your registration, but there are two different spellings of your name. Which is correct?
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Option 1: What they typed — recommended */}
                <button onClick={() => {
                  setPreRegName(null);
                  confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
                  setStep("found");
                }} className="group w-full p-5 rounded-2xl border-4 border-primary bg-primary/5 hover:bg-primary/10 text-left transition-all space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-2xl text-primary">{firstName} {lastName}</p>
                    <span className="text-xs font-bold bg-primary text-white px-2 py-1 rounded-full">RECOMMENDED</span>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">What you entered today — you know your name best</p>
                </button>

                {/* Option 2: What's on file */}
                <button onClick={() => {
                  setFirstName(preRegName.firstName);
                  setLastName(preRegName.lastName);
                  setPreRegName(null);
                  confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
                  setStep("found");
                }} className="w-full p-5 rounded-2xl border-4 border-foreground bg-white hover:bg-gray-50 text-left transition-all space-y-1">
                  <p className="font-display text-2xl">{preRegName.firstName} {preRegName.lastName}</p>
                  <p className="text-sm font-medium text-muted-foreground">What we have on file from your registration</p>
                </button>
              </div>
            </motion.div>
          )}

          {step === "dup_name_confirm" && storedName && storedAttendeeId && (
            <motion.div key="dup_name_confirm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl mx-auto space-y-6">
              <div className="text-center space-y-3">
                <div className="text-5xl">👋</div>
                <h2 className="font-display text-4xl md:text-5xl leading-tight">We've got you!</h2>
                <p className="text-xl font-medium text-muted-foreground">
                  We have your name on file but it looks a little different than what you entered. Which is correct?
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button onClick={() => {
                  setStoredName(null); setStoredAttendeeId(null);
                  setStep("duplicate");
                }} className="w-full p-5 rounded-2xl border-4 border-foreground bg-white hover:bg-muted/30 text-left transition-all space-y-1">
                  <p className="font-display text-2xl">{storedName.firstName} {storedName.lastName}</p>
                  <p className="text-sm font-medium text-muted-foreground">What we have on file</p>
                </button>

                <button onClick={async () => {
                  await correctStoredName(storedAttendeeId, firstName.trim(), lastName.trim());
                  setStoredName(null); setStoredAttendeeId(null);
                  setStep("duplicate");
                }} className="w-full p-5 rounded-2xl border-4 border-foreground bg-white hover:bg-muted/30 text-left transition-all space-y-1">
                  <p className="font-display text-2xl">{firstName} {lastName}</p>
                  <p className="text-sm font-medium text-muted-foreground">What you entered today</p>
                </button>
              </div>
            </motion.div>
          )}

          {step === "duplicate" && (
            <motion.div key="duplicate" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }} className="w-full max-w-2xl mx-auto text-center space-y-8 py-8">
              <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: [0,-10,10,-5,5,0], scale: 1 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1 }} className="text-[8rem] md:text-[10rem] leading-none select-none">👋</motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-4">
                <h2 className="font-display text-5xl md:text-7xl text-primary leading-none">HEY {firstName.toUpperCase()}!</h2>
                <p className="font-display text-3xl md:text-4xl text-foreground leading-snug">
                  NO WORRIES —<br />WE ALREADY GOT YOU!
                </p>
                <p className="text-2xl font-bold text-muted-foreground">
                  You're already checked in. Go enjoy the rally! 🎉
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* FUN: Declined to volunteer */}
          {step === "fun" && (
            <motion.div key="fun" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }} className="w-full max-w-2xl mx-auto text-center space-y-8 py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.6 }}
                className="text-[8rem] md:text-[10rem] leading-none select-none">🎊</motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
                <h2 className="font-display text-5xl md:text-7xl text-primary leading-none">TOTALLY COOL!</h2>
                <p className="font-display text-3xl md:text-4xl text-foreground">Go enjoy the rally, {firstName.toUpperCase()}!</p>
                <p className="text-xl font-medium text-muted-foreground">We appreciate you being here. 💙</p>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 4: YOU'RE IN */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }} className="w-full max-w-2xl mx-auto text-center space-y-8 py-8">
              <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: [0,-10,10,-5,5,0], scale: 1 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1 }} className="text-[8rem] md:text-[10rem] leading-none select-none">
                {checkedInVolunteerRole ? "🎉" : "✊"}
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-4">
                <h2 className="font-display text-5xl md:text-7xl text-primary leading-none">YOU'RE IN!</h2>
                <p className="font-display text-3xl md:text-5xl text-foreground leading-tight">
                  WELCOME TO NO KINGS 3,<br />{firstName.toUpperCase()}!
                </p>
                {checkedInVolunteerRole ? (
                  <div className="border-4 border-primary rounded-2xl bg-primary/5 p-6 mt-4 space-y-3">
                    <p className="font-bold text-xl text-primary">
                      🎖️ Congrats, you're checked in as a {ROLE_META[checkedInVolunteerRole]?.title ?? checkedInVolunteerRole}!
                    </p>
                    {isVolunteerManual ? (
                      <>
                        <p className="font-bold text-lg">Please make sure to let the <span className="text-primary">safety team</span> know we couldn't find your pre-registration details.</p>
                        <p className="font-bold text-lg">You're registered as a <span className="text-primary">{ROLE_META[checkedInVolunteerRole]?.title}</span> — they'll get you your proper vest and assignment for today.</p>
                        <p className="font-display text-xl text-primary mt-2">Welcome to No Kings 3!<br />We're so glad to have you as part of the team! 🧡</p>
                      </>
                    ) : ROLE_META[checkedInVolunteerRole]?.hasVest ? (
                      <>
                        <p className="font-bold text-xl">Please see the safety team to pick up your</p>
                        <p className="font-display text-2xl text-primary">VEST + NK3 Volunteer Button 🧡</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-xl">Please pick up your</p>
                        <p className="font-display text-2xl text-primary">NK3 Volunteer Button 🧡</p>
                        <p className="text-muted-foreground font-medium">at the info table</p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">Go enjoy the rally! 🎉</p>
                )}
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
