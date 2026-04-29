import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { UserPlus, Mail, Phone, Shield, Activity, HeartHandshake, Megaphone, CheckCircle, ArrowRight, ArrowLeft, PartyPopper, HardHat, Info, AlertCircle, Users, ClipboardCheck, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAttendeeLookup, useCheckInSubmit } from "@/hooks/use-checkin";
import { useEventConfig } from "@/hooks/use-event-config";
import { eventApiBase } from "@/lib/event-slug";
import type { VolunteerPreRegResult } from "@workspace/api-client-react";

type RoleState = {
  roleName: string;
  title: string;
  Icon: React.ElementType;
  hasServed: boolean;
  isTrained: boolean;
  wantsToServeToday: boolean | null;
};

const ROLE_META: Record<string, { title: string; Icon: React.ElementType; hasVest: boolean }> = {
  safety_marshal:      { title: "Safety Marshal",      Icon: Shield,         hasVest: true },
  medic:               { title: "Medic",               Icon: Activity,       hasVest: true },
  de_escalator:        { title: "De-escalator",        Icon: HeartHandshake, hasVest: true },
  chant_lead:          { title: "Chant Lead",          Icon: Megaphone,      hasVest: true },
  information_services:{ title: "Information Services", Icon: Info,           hasVest: false },
};

type Step = "home" | "lookup" | "found" | 2 | "vol_gate" | 3 | "future_contact" | "invite" | "volunteer" | "fun" | "duplicate" | 4
          | "vol_found" | "vol_not_found" | "vol_manual" | "name_confirm" | "dup_name_confirm" | "shared_email";

export default function CheckInFlow() {
  const { toast } = useToast();
  const { data: config } = useEventConfig();

  const roleDefs = useMemo((): Pick<RoleState, "roleName" | "title" | "Icon">[] => {
    if (!config?.roles?.length) return [];
    return config.roles.map(r => ({
      roleName: r.key,
      title: r.displayName,
      Icon: ROLE_META[r.key]?.Icon ?? Shield,
    }));
  }, [config]);

  const eventTitle = config?.name ?? "No Kings 3 Rally";
  const eventDateDisplay = config?.eventDate
    ? (() => {
        const datePart = String(config.eventDate).slice(0, 10);
        const d = new Date(datePart + "T12:00:00");
        return isNaN(d.getTime())
          ? String(config.eventDate)
          : d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      })()
    : "March 28";

  const [step, setStep] = useState<Step>("home");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preRegistered, setPreRegistered] = useState(false);
  const [mobilizeId, setMobilizeId] = useState<string | null>(null);
  const [walkinSource, setWalkinSource] = useState<"not_found" | "direct">("direct");
  const [roles, setRoles] = useState<RoleState[]>([]);
  const [isVolunteerMode, setIsVolunteerMode] = useState(false);
  const [volunteerPreRegData, setVolunteerPreRegData] = useState<VolunteerPreRegResult | null>(null);
  const [checkedInVolunteerRole, setCheckedInVolunteerRole] = useState<string | null>(null);
  const [volunteerManualRole, setVolunteerManualRole] = useState<string | null>(null);
  const [isVolunteerManual, setIsVolunteerManual] = useState(false);
  const [preRegName, setPreRegName] = useState<{ firstName: string; lastName: string } | null>(null);
  const [storedName, setStoredName] = useState<{ firstName: string; lastName: string } | null>(null);
  const [storedAttendeeId, setStoredAttendeeId] = useState<number | null>(null);
  const [sharedEmailWith, setSharedEmailWith] = useState<string | null>(null);
  const [newEmailForShared, setNewEmailForShared] = useState("");
  const [isSharedEmailUpdater, setIsSharedEmailUpdater] = useState(false);
  const [volPriorRoles, setVolPriorRoles] = useState<Record<string, { hasServed: boolean; isTrained: boolean }>>({});
  const [wonNoIceButton, setWonNoIceButton] = useState(false);
  const [wantsToBeContacted, setWantsToBeContacted] = useState<boolean | null>(null);
  const [futureContactSource, setFutureContactSource] = useState<"vol_gate" | 3 | "invite">("vol_gate");

  const lookupMutation = useAttendeeLookup();
  const submitMutation = useCheckInSubmit();

  const eligibleRoles = roles.filter(r => r.hasServed || r.isTrained);
  const anyEligible = eligibleRoles.length > 0;

  useEffect(() => {
    setRoles(roleDefs.map(d => ({ ...d, hasServed: false, isTrained: false, wantsToServeToday: null })));
  }, [roleDefs]);

  const handleReset = () => {
    setStep("home");
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setPreRegistered(false); setMobilizeId(null);
    setWalkinSource("direct");
    setRoles(roleDefs.map(d => ({ ...d, hasServed: false, isTrained: false, wantsToServeToday: null })));
    setIsVolunteerMode(false);
    setVolunteerPreRegData(null);
    setCheckedInVolunteerRole(null);
    setVolunteerManualRole(null);
    setIsVolunteerManual(false);
    setPreRegName(null);
    setStoredName(null);
    setStoredAttendeeId(null);
    setSharedEmailWith(null);
    setNewEmailForShared("");
    setIsSharedEmailUpdater(false);
    setVolPriorRoles({});
    setWonNoIceButton(false);
    setWantsToBeContacted(null);
    setFutureContactSource("vol_gate");
  };

  const buildVolRoles = (primaryRole: string, wantsToServeTodayValue: boolean | null) => {
    const result: Array<{ roleName: string; isTrained: boolean; hasServed: boolean; wantsToServeToday: boolean | null }> = [];
    const primary = volPriorRoles[primaryRole];
    result.push({ roleName: primaryRole, isTrained: true, hasServed: primary?.hasServed ?? false, wantsToServeToday: wantsToServeTodayValue });
    for (const [rn, flags] of Object.entries(volPriorRoles)) {
      if (rn === primaryRole) continue;
      if (flags.hasServed || flags.isTrained) {
        result.push({ roleName: rn, isTrained: flags.isTrained, hasServed: flags.hasServed, wantsToServeToday: false });
      }
    }
    return result;
  };

  const updateVolPriorRole = (roleName: string, field: "hasServed" | "isTrained", value: boolean) => {
    setVolPriorRoles(prev => {
      const current = prev[roleName] ?? { hasServed: false, isTrained: false };
      return { ...prev, [roleName]: { ...current, [field]: value } };
    });
  };

  const handleCheckinError = (err: unknown) => {
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
  };

  const correctStoredName = async (attendeeId: number, newFirst: string, newLast: string) => {
    await fetch(`${eventApiBase()}/check-in/correct-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendeeId, email, firstName: newFirst, lastName: newLast }),
    });
  };

  const handleLookup = () => {
    if (!firstName.trim() || !email.trim()) {
      toast({ title: "Hold up!", description: "We need both first name and email.", variant: "destructive" });
      return;
    }
    lookupMutation.mutate({ data: { firstName: firstName.trim(), email: email.trim(), isVolunteer: isVolunteerMode } }, {
      onSuccess: (data) => {
        const d = data as typeof data & { sharedEmail?: boolean; sharedEmailWith?: string };
        if (d.sharedEmail) {
          setSharedEmailWith(d.sharedEmailWith ?? "another attendee");
          setNewEmailForShared("");
          setPreRegistered(true);
          setStep("shared_email");
          return;
        }

        if (data.alreadyCheckedIn) {
          setStep("duplicate");
          return;
        }

        if (isVolunteerMode) {
          if (data.volunteerPreReg) {
            const vpr = data.volunteerPreReg;
            setVolunteerPreRegData(vpr);
            setFirstName(vpr.firstName);
            setLastName(vpr.lastName);
            if (vpr.email) setEmail(vpr.email);
            if (vpr.phone) setPhone(vpr.phone);
            setStep("vol_found");
          } else {
            setStep("vol_not_found");
          }
          return;
        }

        if (data.volunteerPreReg) {
          const vpr = data.volunteerPreReg;
          setVolunteerPreRegData(vpr);
          setFirstName(vpr.firstName);
          setLastName(vpr.lastName);
          if (vpr.email) setEmail(vpr.email);
          if (vpr.phone) setPhone(vpr.phone);
          setIsVolunteerMode(true);
          setStep("vol_found");
          return;
        }

        if (data.found) {
          setPreRegistered(true);
          setMobilizeId(data.mobilizeId ?? null);
          const d2 = data as typeof data & { foundFirstName?: string; foundLastName?: string };
          const foundFirst = (d2.foundFirstName ?? "").trim().toLowerCase();
          const typedFirst = firstName.trim().toLowerCase();
          if (d2.foundFirstName && foundFirst !== typedFirst) {
            setPreRegName({ firstName: d2.foundFirstName, lastName: d2.foundLastName ?? "" });
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

  const submitCheckin = (rolesToSubmit: RoleState[], contactPref: boolean | null = null) => {
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || "Unknown",
      email: email.trim(),
      phone: phone.trim() || null,
      preRegistered,
      mobilizeId,
      wantsToBeContacted: contactPref ?? null,
      roles: rolesToSubmit
        .filter(r => r.hasServed || r.isTrained || r.wantsToServeToday === true)
        .map(r => ({ roleName: r.roleName, isTrained: r.isTrained, hasServed: r.hasServed, wantsToServeToday: r.wantsToServeToday === true }))
    };
    submitMutation.mutate({ data: payload }, {
      onSuccess: (data) => {
        const won = !!(data as typeof data & { wonNoIceButton?: boolean }).wonNoIceButton;
        if (won) setWonNoIceButton(true);
        const isVolunteering = rolesToSubmit.some(r => r.wantsToServeToday === true);
        if (isVolunteering) {
          confetti({ particleCount: 250, spread: 140, origin: { y: 0.4 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
          setStep("volunteer");
        } else {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff'] });
          setStep(4);
        }
      },
      onError: handleCheckinError,
    });
  };

  const submitVolunteerCheckin = () => {
    const roleName = volunteerPreRegData!.roleName;
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || "Volunteer",
      email: email.trim(),
      phone: phone.trim() || null,
      preRegistered: true,
      mobilizeId: null,
      wantsToBeContacted: null,
      roles: buildVolRoles(roleName, null),
    };
    submitMutation.mutate({ data: payload }, {
      onSuccess: (data) => {
        const won = !!(data as typeof data & { wonNoIceButton?: boolean }).wonNoIceButton;
        if (won) setWonNoIceButton(true);
        setCheckedInVolunteerRole(roleName);
        confetti({ particleCount: 300, spread: 160, origin: { y: 0.4 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
        setStep(4);
      },
      onError: handleCheckinError,
    });
  };

  // Auto-advance from "found" to vol_gate
  useEffect(() => {
    if (step === "found") { const t = setTimeout(() => setStep("vol_gate"), 3000); return () => clearTimeout(t); }
    return undefined;
  }, [step]);

  useEffect(() => {
    if (step === "duplicate") { const t = setTimeout(handleReset, 7000); return () => clearTimeout(t); }
    return undefined;
  }, [step]);

  useEffect(() => {
    if (step === "volunteer") { const t = setTimeout(() => setStep(4), 4000); return () => clearTimeout(t); }
    return undefined;
  }, [step]);

  useEffect(() => {
    if (step === "fun") { const t = setTimeout(() => setStep(4), 5000); return () => clearTimeout(t); }
    return undefined;
  }, [step]);

  useEffect(() => {
    if (step === 4) { const t = setTimeout(handleReset, wonNoIceButton ? 20000 : 8000); return () => clearTimeout(t); }
    return undefined;
  }, [step, wonNoIceButton]);

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
      preRegistered: true,
      mobilizeId: null,
      wantsToBeContacted: null,
      roles: buildVolRoles(volunteerManualRole, true),
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

  const updateRole = (id: string, updates: Partial<RoleState>) => {
    setRoles(prev => prev.map(r => {
      if (r.roleName !== id) return r;
      const next = { ...r, ...updates };
      if (!next.hasServed && !next.isTrained) next.wantsToServeToday = null;
      return next;
    }));
  };

  const showBackButton = step === "lookup" || step === 2 || step === "vol_gate" || step === 3 || step === "invite"
    || step === "future_contact" || step === "vol_found" || step === "vol_not_found" || step === "vol_manual";

  const handleBack = () => {
    if (step === "lookup") setStep("home");
    else if (step === 2) setStep("lookup");
    else if (step === "vol_gate") { if (preRegistered) setStep("lookup"); else setStep(2); }
    else if (step === 3) setStep("vol_gate");
    else if (step === "invite") setStep(3);
    else if (step === "future_contact") {
      if (futureContactSource === "invite") setStep("invite");
      else if (futureContactSource === 3) setStep(3);
      else setStep("vol_gate");
    }
    else if (step === "vol_found" || step === "vol_not_found") { setVolunteerPreRegData(null); setStep("lookup"); }
    else if (step === "vol_manual") { setVolunteerManualRole(null); setStep("vol_not_found"); }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-white">
      {/* Header */}
      <header className="py-4 px-6 md:px-12 border-b-4 border-foreground bg-foreground flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <img src="/icu-logo.jpg" alt="Indivisible Cherokee United" className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover" />
          <div>
            <h1 className="font-display text-xl md:text-3xl text-white leading-tight">{eventTitle}</h1>
            <p className="text-white/70 text-sm font-medium hidden md:block">{eventDateDisplay} · ICU <span className="whitespace-nowrap">Check-In</span></p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <img src="/nk3-banner.png" alt="No Kings" className="h-12 md:h-14 w-auto object-contain flex-shrink-0" />
          {showBackButton && (
            <Button variant="outline" size="sm"
              className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white"
              onClick={handleBack}
            >
              <ArrowLeft className="w-5 h-5 mr-2" /> Back
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-6 md:p-12 flex flex-col justify-center">
        <AnimatePresence mode="wait" initial={false}>

          {/* HOME: Mode selection — or Event Ended screen */}
          {step === "home" && (
            config && !config.isActive ? (
              <motion.div key="ended" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="w-full max-w-2xl mx-auto space-y-8 text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl border-4 border-foreground bg-muted shadow-brutal mx-auto">
                  <CalendarX className="w-12 h-12 text-muted-foreground" />
                </div>
                <div className="space-y-4">
                  <h2 className="font-display text-5xl md:text-6xl">This Event Has Ended</h2>
                  <p className="text-xl md:text-2xl font-medium text-muted-foreground">
                    <strong>{eventTitle}</strong> is no longer accepting check-ins.
                  </p>
                  <p className="text-lg font-medium text-muted-foreground">
                    Thank you for being part of it — we hope to see you at the next one!
                  </p>
                </div>
                <div className="pt-4">
                  <a href="/"
                    className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl border-4 border-foreground bg-primary text-white font-display text-xl shadow-brutal hover:shadow-brutal-sm hover:translate-y-0.5 transition-all">
                    <ArrowRight className="w-6 h-6" />
                    Find Another Event
                  </a>
                </div>
              </motion.div>
            ) : (
              <motion.div key="home" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-2xl mx-auto space-y-8">
                <div className="text-center space-y-4 mb-8">
                  <h2 className="font-display text-5xl md:text-7xl text-primary">Welcome!</h2>
                  <p className="text-2xl md:text-3xl font-medium text-muted-foreground">How are you here today?</p>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <button
                    onClick={() => { setIsVolunteerMode(false); setStep("lookup"); }}
                    className="group w-full p-8 rounded-2xl border-4 border-foreground bg-white hover:bg-secondary/50 hover:border-primary transition-all text-left shadow-brutal space-y-3"
                  >
                    <div className="flex items-center gap-5">
                      <div className="flex-shrink-0 w-16 h-16 rounded-2xl border-4 border-foreground bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                        <Users className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="font-display text-3xl md:text-4xl leading-tight">I'm an Attendee</p>
                        <p className="text-lg font-medium text-muted-foreground mt-1">Here to rally today</p>
                      </div>
                      <ArrowRight className="w-8 h-8 ml-auto text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>

                  <button
                    onClick={() => { setIsVolunteerMode(true); setStep("lookup"); }}
                    className="group w-full p-8 rounded-2xl border-4 border-primary bg-primary/5 hover:bg-primary/15 transition-all text-left shadow-brutal space-y-3"
                  >
                    <div className="flex items-center gap-5">
                      <div className="flex-shrink-0 w-16 h-16 rounded-2xl border-4 border-primary bg-primary flex items-center justify-center">
                        <HardHat className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <p className="font-display text-3xl md:text-4xl text-primary leading-tight">I'm a Volunteer</p>
                        <p className="text-lg font-medium text-muted-foreground mt-1">On the team today</p>
                      </div>
                      <ArrowRight className="w-8 h-8 ml-auto text-primary group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                </div>
              </motion.div>
            )
          )}

          {/* LOOKUP: Name + email form */}
          {step === "lookup" && (
            <motion.div key="lookup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-4 mb-8">
                {isVolunteerMode ? (
                  <>
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-primary rounded-2xl border-4 border-foreground shadow-brutal-sm mb-2">
                      <HardHat className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="font-display text-4xl md:text-6xl text-primary">Volunteer<br /><span className="whitespace-nowrap">Check-In</span></h2>
                    <p className="text-xl md:text-2xl font-medium text-muted-foreground">Let's find you in our volunteer list.</p>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-secondary rounded-2xl border-4 border-foreground shadow-brutal-sm mb-2">
                      <ClipboardCheck className="w-10 h-10 text-foreground" />
                    </div>
                    <h2 className="font-display text-4xl md:text-6xl">Attendee<br /><span className="whitespace-nowrap">Check-In</span></h2>
                    <p className="text-xl md:text-2xl font-medium text-muted-foreground">Enter your name and email to get started.</p>
                  </>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <label className="font-display text-2xl uppercase tracking-wider mb-3 block">First Name</label>
                  <Input placeholder="Enter your first name" icon={<UserPlus className="w-8 h-8" />}
                    value={firstName} onChange={(e) => setFirstName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()} autoFocus />
                </div>
                <div>
                  <label className="font-display text-2xl uppercase tracking-wider mb-3 block">Email Address</label>
                  <Input placeholder="Enter your email" type="email" icon={<Mail className="w-8 h-8" />}
                    value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()} />
                </div>
              </div>

              <div className="space-y-4 mt-8">
                <Button size="xl" className="w-full group" onClick={handleLookup} isLoading={lookupMutation.isPending}>
                  {isVolunteerMode ? "Look Me Up" : "Find My Registration"} <ArrowRight className="ml-3 w-7 h-7 group-hover:translate-x-1 transition-transform" />
                </Button>
                {!isVolunteerMode && (
                  <Button size="xl" variant="secondary" className="w-full group border-4 border-foreground shadow-brutal"
                    onClick={() => {
                      if (!firstName.trim() || !email.trim()) {
                        toast({ title: "Hold up!", description: "We need your first name and email first.", variant: "destructive" }); return;
                      }
                      setPreRegistered(false); setWalkinSource("direct"); setStep(2);
                    }}>
                    I'm Not Pre-Registered <UserPlus className="ml-3 w-7 h-7" />
                  </Button>
                )}
              </div>
              <p className="text-center text-muted-foreground font-medium text-lg mt-3">
                {isVolunteerMode
                  ? "We'll check our volunteer list — enter the first name and email you registered with."
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

          {/* VOL_GATE: Have you ever volunteered/trained? */}
          {step === "vol_gate" && (
            <motion.div key="vol_gate" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-4 mb-8">
                <div className="text-6xl md:text-7xl">🤝</div>
                <h2 className="font-display text-4xl md:text-5xl leading-tight">Quick question,<br />{firstName || "friend"}!</h2>
                <p className="text-2xl font-medium text-muted-foreground">
                  Have you ever volunteered at or been trained for an event like this?
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => setStep(3)}
                  className="group w-full p-8 rounded-2xl border-4 border-primary bg-primary/5 hover:bg-primary/15 transition-all text-left shadow-brutal"
                >
                  <div className="flex items-center gap-5">
                    <div className="text-5xl">✋</div>
                    <div>
                      <p className="font-display text-3xl text-primary">Yes, I have!</p>
                      <p className="text-lg font-medium text-muted-foreground mt-1">Safety Marshal, Medic, De-escalator, or Chant Lead</p>
                    </div>
                    <ArrowRight className="w-8 h-8 ml-auto text-primary group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => { setFutureContactSource("vol_gate"); setStep("future_contact"); }}
                  className="group w-full p-8 rounded-2xl border-4 border-foreground bg-white hover:bg-muted/30 transition-all text-left shadow-brutal"
                >
                  <div className="flex items-center gap-5">
                    <div className="text-5xl">🙅</div>
                    <div>
                      <p className="font-display text-3xl">No, first time!</p>
                      <p className="text-lg font-medium text-muted-foreground mt-1">I'm new to event volunteering</p>
                    </div>
                    <ArrowRight className="w-8 h-8 ml-auto text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>
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

              {(() => {
                const roleName = volunteerPreRegData.roleName;
                const configRole = roleDefs.find(r => r.roleName === roleName);
                const fallback = ROLE_META[roleName] ?? { title: roleName, Icon: HardHat };
                const displayTitle = configRole?.title ?? fallback.title;
                const DisplayIcon = configRole?.Icon ?? fallback.Icon;
                return (
                  <div className="flex items-center justify-center gap-4 p-6 bg-primary/10 border-4 border-primary rounded-2xl">
                    <div className="p-4 bg-primary rounded-2xl border-4 border-foreground shadow-brutal-sm">
                      <DisplayIcon className="w-10 h-10 text-white" />
                    </div>
                    <div>
                      <p className="font-display text-4xl md:text-5xl text-primary">{displayTitle}</p>
                      <p className="font-bold text-muted-foreground">{eventTitle} Volunteer</p>
                    </div>
                  </div>
                );
              })()}

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

              {roleDefs.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <p className="font-display text-lg uppercase tracking-wider">Prior experience <span className="text-muted-foreground font-sans font-medium normal-case text-sm">(optional)</span></p>
                      <p className="text-sm font-medium text-muted-foreground mt-1">Have you worked in or trained for any of these roles at a previous rally or event?</p>
                    </div>
                    <div className="space-y-2">
                      {roleDefs.map(({ roleName: rn, title, Icon }) => {
                        const prior = volPriorRoles[rn] ?? { hasServed: false, isTrained: false };
                        const isPrimary = rn === volunteerPreRegData.roleName;
                        return (
                          <div key={rn} className={`p-3 rounded-xl border-2 ${isPrimary ? 'border-primary/40 bg-primary/5' : 'border-foreground/15 bg-white'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`w-4 h-4 flex-shrink-0 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className={`font-bold text-sm ${isPrimary ? 'text-primary' : ''}`}>{title}</span>
                              {isPrimary && <span className="ml-auto text-xs bg-primary text-white px-2 py-0.5 rounded-full font-medium">Today's role</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => updateVolPriorRole(rn, 'hasServed', !prior.hasServed)}
                                className={`py-2 rounded-lg border-2 text-xs font-bold transition-all
                                  ${prior.hasServed ? 'border-primary bg-primary text-white' : 'border-foreground/30 bg-white hover:bg-muted/20 text-foreground'}`}>
                                {prior.hasServed ? '✓ ' : ''}Worked it before
                              </button>
                              <button onClick={() => updateVolPriorRole(rn, 'isTrained', !prior.isTrained)}
                                className={`py-2 rounded-lg border-2 text-xs font-bold transition-all
                                  ${prior.isTrained ? 'border-primary bg-primary text-white' : 'border-foreground/30 bg-white hover:bg-muted/20 text-foreground'}`}>
                                {prior.isTrained ? '✓ ' : ''}Trained before
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
              )}

              <Button size="xl" className="w-full group" onClick={submitVolunteerCheckin}
                isLoading={submitMutation.isPending} disabled={submitMutation.isPending}>
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
                  <label className="font-display text-2xl uppercase tracking-wider mb-3 block">Last Name</label>
                  <Input placeholder="Enter your last name" icon={<UserPlus className="w-8 h-8" />}
                    value={lastName} onChange={(e) => setLastName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="font-display text-2xl uppercase tracking-wider mb-3 block">
                    Phone <span className="text-muted-foreground font-sans font-medium normal-case text-base">(optional)</span>
                  </label>
                  <Input placeholder="Enter your phone number" type="tel" icon={<Phone className="w-8 h-8" />}
                    value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="font-display text-2xl uppercase tracking-wider mb-3 block">Which role did you sign up for?</label>
                  <div className="grid grid-cols-1 gap-2">
                    {roleDefs.map(({ roleName, title, Icon }) => (
                      <button key={roleName} onClick={() => setVolunteerManualRole(roleName)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left
                          ${volunteerManualRole === roleName
                            ? 'border-primary bg-primary/10'
                            : 'border-foreground/30 bg-white hover:bg-muted/20'}`}>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${volunteerManualRole === roleName ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`font-bold text-base ${volunteerManualRole === roleName ? 'text-primary' : ''}`}>
                          {title}
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
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div>
                    <p className="font-display text-lg uppercase tracking-wider">Prior experience <span className="text-muted-foreground font-sans font-medium normal-case text-sm">(optional)</span></p>
                    <p className="text-sm font-medium text-muted-foreground mt-1">Have you worked in or trained for any of these roles at a previous rally or event?</p>
                  </div>
                  <div className="space-y-2">
                    {roleDefs.map(({ roleName: rn, title, Icon }) => {
                      const prior = volPriorRoles[rn] ?? { hasServed: false, isTrained: false };
                      const isPrimary = rn === volunteerManualRole;
                      return (
                        <div key={rn} className={`p-3 rounded-xl border-2 ${isPrimary ? 'border-primary/40 bg-primary/5' : 'border-foreground/15 bg-white'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-4 h-4 flex-shrink-0 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className={`font-bold text-sm ${isPrimary ? 'text-primary' : ''}`}>{title}</span>
                            {isPrimary && <span className="ml-auto text-xs bg-primary text-white px-2 py-0.5 rounded-full font-medium">Today's role</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => updateVolPriorRole(rn, 'hasServed', !prior.hasServed)}
                              className={`py-2 rounded-lg border-2 text-xs font-bold transition-all
                                ${prior.hasServed ? 'border-primary bg-primary text-white' : 'border-foreground/30 bg-white hover:bg-muted/20 text-foreground'}`}>
                              {prior.hasServed ? '✓ ' : ''}Worked it before
                            </button>
                            <button onClick={() => updateVolPriorRole(rn, 'isTrained', !prior.isTrained)}
                              className={`py-2 rounded-lg border-2 text-xs font-bold transition-all
                                ${prior.isTrained ? 'border-primary bg-primary text-white' : 'border-foreground/30 bg-white hover:bg-muted/20 text-foreground'}`}>
                              {prior.isTrained ? '✓ ' : ''}Trained before
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                <label className="font-display text-2xl uppercase tracking-wider mb-3 block">Last Name</label>
                <Input placeholder="Enter your last name" icon={<UserPlus className="w-8 h-8" />}
                  value={lastName} onChange={(e) => setLastName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep("vol_gate")} autoFocus />
              </div>
              <div>
                <label className="font-display text-2xl uppercase tracking-wider mb-3 block">
                  Phone Number <span className="text-muted-foreground font-sans font-medium normal-case text-base">(optional)</span>
                </label>
                <Input placeholder="Enter your phone number" type="tel" icon={<Phone className="w-8 h-8" />}
                  value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setStep("vol_gate")} />
              </div>
              <Button size="xl" className="w-full mt-8 group" onClick={() => setStep("vol_gate")}>
                Continue <ArrowRight className="ml-4 w-8 h-8 group-hover:translate-x-2 transition-transform" />
              </Button>
            </motion.div>
          )}

          {/* STEP 3: EXPERIENCE CHECKBOXES (only reached if vol_gate = Yes) */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-3xl mx-auto space-y-8">
              <div className="text-center space-y-2 mb-4">
                <h2 className="font-display text-4xl md:text-5xl">Great! Which roles?</h2>
                <p className="text-xl font-medium text-muted-foreground">Tell us which roles you've served in or trained for.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roleDefs.map(({ roleName, title, Icon }) => {
                  const role = roles.find(r => r.roleName === roleName) ?? { hasServed: false, isTrained: false, wantsToServeToday: null as boolean | null };
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
                  <Button size="xl" variant="secondary" className="w-full border-4 border-foreground"
                    onClick={() => { setFutureContactSource(3); setStep("future_contact"); }}>
                    None of the above — continue →
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
                  Would you like to help out today? We'd love to have you — there's a cool {eventTitle} button in it for you! 🎉
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
                onClick={() => {
                  const anyYes = eligibleRoles.some(r => r.wantsToServeToday === true);
                  if (anyYes) {
                    submitCheckin(roles, null);
                  } else {
                    setFutureContactSource("invite");
                    setStep("future_contact");
                  }
                }}
                isLoading={submitMutation.isPending}>
                {eligibleRoles.some(r => r.wantsToServeToday === true) ? <>Check Me In as Volunteer <CheckCircle className="ml-4 w-8 h-8" /></> : <>Continue <ArrowRight className="ml-3 w-7 h-7" /></>}
              </Button>
              {eligibleRoles.some(r => r.wantsToServeToday === null) && (
                <p className="text-center text-sm text-muted-foreground font-medium">Please answer yes or no for each role above</p>
              )}
            </motion.div>
          )}

          {/* FUTURE_CONTACT: Want to be contacted about future volunteering? */}
          {step === "future_contact" && (
            <motion.div key="future_contact" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8">
              <div className="text-center space-y-4 mb-8">
                <div className="text-6xl md:text-7xl">📣</div>
                <h2 className="font-display text-4xl md:text-5xl leading-tight">One more thing!</h2>
                <p className="text-2xl font-medium text-muted-foreground">
                  Would you like us to reach out about volunteering at future events?
                </p>
                <p className="text-lg text-muted-foreground font-medium">
                  We're always looking for great people to join the team.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => {
                    setWantsToBeContacted(true);
                    submitCheckin(roles, true);
                  }}
                  disabled={submitMutation.isPending}
                  className="group w-full p-8 rounded-2xl border-4 border-primary bg-primary/5 hover:bg-primary/15 transition-all text-left shadow-brutal disabled:opacity-50"
                >
                  <div className="flex items-center gap-5">
                    <div className="text-5xl">🙋</div>
                    <div>
                      <p className="font-display text-3xl text-primary">Yes, please!</p>
                      <p className="text-lg font-medium text-muted-foreground mt-1">I'd love to hear about future opportunities</p>
                    </div>
                    <ArrowRight className="w-8 h-8 ml-auto text-primary group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setWantsToBeContacted(false);
                    submitCheckin(roles, false);
                  }}
                  disabled={submitMutation.isPending}
                  className="group w-full p-8 rounded-2xl border-4 border-foreground bg-white hover:bg-muted/30 transition-all text-left shadow-brutal disabled:opacity-50"
                >
                  <div className="flex items-center gap-5">
                    <div className="text-5xl">👍</div>
                    <div>
                      <p className="font-display text-3xl">No thanks</p>
                      <p className="text-lg font-medium text-muted-foreground mt-1">Just here to rally today</p>
                    </div>
                    <ArrowRight className="w-8 h-8 ml-auto text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              </div>
              {submitMutation.isPending && (
                <p className="text-center text-muted-foreground font-medium text-lg">Checking you in…</p>
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
                  <p className="font-bold text-xl">Welcome to the team!</p>
                  <p className="font-bold text-xl text-primary">Let the safety team know your role — they'll get you your proper vest, {eventTitle} volunteer button and assignment. 🧡</p>
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

          {/* SHARED EMAIL: two people, one email address */}
          {step === "shared_email" && (
            <motion.div key="shared_email" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }}
              className="w-full max-w-2xl mx-auto space-y-8 py-4">
              <div className="text-center space-y-3">
                <div className="text-[6rem] leading-none select-none">📧</div>
                <h2 className="font-display text-4xl md:text-6xl text-primary leading-none">ONE MORE THING</h2>
                <p className="text-xl font-bold text-foreground">
                  <span className="text-primary">{sharedEmailWith}</span> already checked in with that email.
                </p>
                <p className="text-lg text-muted-foreground font-medium">
                  No problem — you're both on the list! Please enter your own email so we can register you separately.
                </p>
              </div>

              <div className="bg-green-50 border-4 border-green-600 rounded-2xl p-5 text-center space-y-1">
                <p className="font-display text-2xl text-green-800">🎁 FREE "No ICE" BUTTON</p>
                <p className="text-green-700 font-medium">As a thank-you for updating your email, grab a free No ICE button at the info table!</p>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-bold text-foreground uppercase tracking-wide">Your Email</label>
                <input
                  type="email"
                  value={newEmailForShared}
                  onChange={e => setNewEmailForShared(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border-4 border-foreground rounded-2xl px-6 py-5 text-2xl font-bold focus:outline-none focus:border-primary transition-colors"
                />
                <Button
                  size="lg"
                  className="w-full text-2xl py-8 font-display"
                  disabled={!newEmailForShared.trim() || submitMutation.isPending}
                  onClick={() => {
                    const updatedEmail = newEmailForShared.trim().toLowerCase();
                    submitMutation.mutate(
                      {
                        data: {
                          firstName: firstName.trim(),
                          lastName: lastName.trim(),
                          email: updatedEmail,
                          phone: phone.trim() || undefined,
                          preRegistered: true,
                          mobilizeId: mobilizeId ?? undefined,
                          wantsToBeContacted: null,
                          roles: [],
                        },
                      },
                      {
                        onSuccess: (data) => {
                          const won = !!(data as typeof data & { wonNoIceButton?: boolean }).wonNoIceButton;
                          if (won) setWonNoIceButton(true);
                          setEmail(updatedEmail);
                          setIsSharedEmailUpdater(true);
                          setStep(4);
                        },
                        onError: handleCheckinError,
                      }
                    );
                  }}
                >
                  {submitMutation.isPending ? "Checking in…" : "CHECK IN"}
                </Button>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                <button onClick={handleReset}
                  className="mt-4 px-8 py-3 rounded-2xl border-4 border-foreground bg-white hover:bg-muted/30 font-display text-xl shadow-brutal transition-all">
                  ← Start Over
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* FUN: kept for backwards compatibility but not reached in new flow */}
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
                  WELCOME TO {eventTitle.toUpperCase()},<br />{firstName.toUpperCase()}!
                </p>

                {wonNoIceButton && (
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.5 }}
                    className="border-4 border-yellow-400 rounded-2xl bg-yellow-50 p-6 space-y-2 text-center shadow-brutal">
                    <p className="text-4xl">🎉🏅🎉</p>
                    <p className="font-display text-3xl md:text-4xl text-yellow-700">YOU WON A FREE</p>
                    <p className="font-display text-4xl md:text-5xl text-yellow-800">"NO ICE" BUTTON!</p>
                    <p className="font-bold text-yellow-700 text-lg mt-2">
                      Come to the front desk at the end of the rally, give them your name, and we'll have it waiting for you!
                    </p>
                  </motion.div>
                )}

                {checkedInVolunteerRole ? (
                  <div className="border-4 border-primary rounded-2xl bg-primary/5 p-6 mt-4 space-y-3">
                    <p className="font-bold text-xl text-primary">
                      🎖️ Congrats, you're checked in as a {roleDefs.find(r => r.roleName === checkedInVolunteerRole)?.title ?? ROLE_META[checkedInVolunteerRole]?.title ?? checkedInVolunteerRole}!
                    </p>
                    {isVolunteerManual ? (
                      <>
                        <p className="font-bold text-lg">Let the <span className="text-primary">safety team</span> know we couldn't find your pre-registration details.</p>
                        <p className="font-bold text-lg">They'll get you your proper vest, {eventTitle} volunteer button and assignment. 🧡</p>
                      </>
                    ) : ROLE_META[checkedInVolunteerRole]?.hasVest ? (
                      <>
                        <p className="font-bold text-xl">Please see the safety team to pick up your</p>
                        <p className="font-display text-2xl text-primary">VEST + {eventTitle} Volunteer Button + Assignment 🧡</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-xl">Please pick up your</p>
                        <p className="font-display text-2xl text-primary">{eventTitle} Volunteer Button + Assignment 🧡</p>
                        <p className="text-muted-foreground font-medium">at the info table</p>
                      </>
                    )}
                  </div>
                ) : isSharedEmailUpdater ? (
                  <div className="border-4 border-green-600 rounded-2xl bg-green-50 p-6 mt-4 space-y-2">
                    <p className="font-display text-2xl text-green-800">🎁 FREE "No ICE" BUTTON</p>
                    <p className="font-bold text-lg text-green-700">Please stop by the info table to pick up your free No ICE button — thank you for updating your email! 💙</p>
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
