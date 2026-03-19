import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { UserPlus, Mail, Phone, Shield, Activity, HeartHandshake, Megaphone, CheckCircle, ArrowRight, ArrowLeft, Smartphone, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAttendeeLookup, useCheckInSubmit } from "@/hooks/use-checkin";
import type { AttendeeRoleRoleName } from "@workspace/api-client-react";

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

function makeInitialRoles(): RoleState[] {
  return ROLE_DEFS.map(d => ({ ...d, hasServed: false, isTrained: false, wantsToServeToday: null }));
}

function useIsMobile() {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 || /Mobi|Android|iPhone|iPod/.test(navigator.userAgent);
  }, []);
}

type Step = 1 | "found" | 2 | 3 | "invite" | "volunteer" | "fun" | "duplicate" | 4;

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
  };

  const handleLookup = () => {
    if (!firstName.trim() || !email.trim()) {
      toast({ title: "Hold up!", description: "We need both first name and email.", variant: "destructive" });
      return;
    }
    lookupMutation.mutate({ data: { firstName: firstName.trim(), email: email.trim() } }, {
      onSuccess: (data) => {
        if (data.alreadyCheckedIn) {
          setStep("duplicate");
        } else if (data.found) {
          setPreRegistered(true);
          setMobilizeId(data.mobilizeId ?? null);
          setStep("found");
          confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 }, colors: ['#1d4ed8','#e11d48','#fbbf24','#ffffff','#10b981'] });
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
          setStep("duplicate");
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
    if (step === 4) { const t = setTimeout(handleReset, 6000); return () => clearTimeout(t); }
  }, [step]);

  const updateRole = (id: AttendeeRoleRoleName, updates: Partial<RoleState>) => {
    setRoles(prev => prev.map(r => {
      if (r.roleName !== id) return r;
      const next = { ...r, ...updates };
      if (!next.hasServed && !next.isTrained) next.wantsToServeToday = null;
      return next;
    }));
  };

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
          {(step === 2 || step === 3 || step === "invite") && (
            <Button variant="outline" size="sm"
              className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                if (step === "invite") setStep(3);
                else if (step === 3) setStep(preRegistered ? 1 : 2);
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
              <div className="text-center space-y-4 mb-12">
                <h2 className="font-display text-5xl md:text-7xl text-primary">Welcome!</h2>
                <p className="text-2xl md:text-3xl font-medium text-muted-foreground">Let's get you checked in to the rally.</p>
              </div>
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
                  Find My Pre-Registration <ArrowRight className="ml-3 w-7 h-7 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button size="xl" variant="secondary" className="w-full group border-4 border-foreground shadow-brutal"
                  onClick={() => {
                    if (!firstName.trim() || !email.trim()) {
                      toast({ title: "Hold up!", description: "We need your first name and email first.", variant: "destructive" }); return;
                    }
                    setPreRegistered(false); setWalkinSource("direct"); setStep(2);
                  }}>
                  Register Me <UserPlus className="ml-3 w-7 h-7" />
                </Button>
              </div>
              <p className="text-center text-muted-foreground font-medium text-base mt-3">
                Pre-registered on Mobilize? Use the first button. New to the rally? Use the second.
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

          {/* DUPLICATE: Already checked in */}
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
                  You're checked in and good to go. 💙<br />Go enjoy the rally!
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* FUN: No worries - transitional */}
          {step === "fun" && (
            <motion.div key="fun" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }} className="w-full max-w-2xl mx-auto text-center space-y-8 py-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-6">
                <h2 className="font-display text-5xl md:text-7xl text-foreground leading-none">NO WORRIES!</h2>
                <p className="font-display text-3xl md:text-4xl text-primary leading-snug">WE'LL CATCH YOU<br />ANOTHER TIME, {firstName.toUpperCase()}!</p>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                  className="text-2xl font-bold text-muted-foreground">
                  Hold tight — we're finishing up your check-in… 💙
                </motion.p>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 4: YOU'RE IN! */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl mx-auto text-center space-y-10 py-12">
              <motion.div initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
                className="w-40 h-40 mx-auto bg-green-500 rounded-full border-8 border-foreground shadow-brutal flex items-center justify-center">
                <CheckCircle className="w-24 h-24 text-white" />
              </motion.div>
              <div className="space-y-4">
                <h2 className="font-display text-6xl md:text-8xl text-primary leading-none">YOU'RE IN!</h2>
                <p className="text-3xl md:text-4xl font-bold">
                  Welcome to the rally, <span className="text-accent underline decoration-8 underline-offset-8">{firstName}</span>!
                </p>
                <p className="text-xl md:text-2xl font-medium text-muted-foreground">Your check-in has been recorded. Let's make our voices heard!</p>
              </div>
              {isMobile && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                  className="border-4 border-foreground rounded-2xl bg-secondary p-8 shadow-brutal space-y-3">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Smartphone className="w-8 h-8" />
                    <span className="font-display text-2xl">Next Step</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold leading-snug">Show this screen at the sign-in desk to pick up your welcome gift.</p>
                  <p className="text-base font-medium text-muted-foreground italic">While supplies last — thank you for being here!</p>
                </motion.div>
              )}
              {!isMobile && (
                <div className="pt-4">
                  <Button size="lg" variant="outline" onClick={handleReset} className="text-xl">
                    Next Person (Auto-reset in 6s…)
                  </Button>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
