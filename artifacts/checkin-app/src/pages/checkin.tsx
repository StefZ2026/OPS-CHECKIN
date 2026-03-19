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
  hasServed: boolean;
  isTrained: boolean;
  wantsToServeToday: boolean;
};

const INITIAL_ROLES: RoleState[] = [
  { roleName: "safety_marshal", hasServed: false, isTrained: false, wantsToServeToday: false },
  { roleName: "medic", hasServed: false, isTrained: false, wantsToServeToday: false },
  { roleName: "de_escalator", hasServed: false, isTrained: false, wantsToServeToday: false },
  { roleName: "chant_lead", hasServed: false, isTrained: false, wantsToServeToday: false },
];

function useIsMobile() {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 || /Mobi|Android|iPhone|iPod/.test(navigator.userAgent);
  }, []);
}

export default function CheckInFlow() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  type Step = 1 | "found" | 2 | 3 | "fun" | 4;
  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preRegistered, setPreRegistered] = useState(false);
  const [mobilizeId, setMobilizeId] = useState<string | null>(null);
  const [walkinSource, setWalkinSource] = useState<"not_found" | "direct">("direct");
  const [roles, setRoles] = useState<RoleState[]>(INITIAL_ROLES);

  const lookupMutation = useAttendeeLookup();
  const submitMutation = useCheckInSubmit();

  const handleReset = () => {
    setStep(1);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPreRegistered(false);
    setMobilizeId(null);
    setRoles(INITIAL_ROLES);
  };

  const handleLookup = () => {
    if (!firstName.trim() || !email.trim()) {
      toast({ title: "Hold up!", description: "We need both first name and email.", variant: "destructive" });
      return;
    }

    lookupMutation.mutate({ data: { firstName: firstName.trim(), email: email.trim() } }, {
      onSuccess: (data) => {
        if (data.alreadyCheckedIn) {
          toast({ title: "Already Checked In!", description: "Looks like you're already on our list today.", variant: "destructive" });
          handleReset();
        } else if (data.found) {
          setPreRegistered(true);
          setMobilizeId(data.mobilizeId ?? null);
          setStep("found");
          confetti({
            particleCount: 200,
            spread: 120,
            origin: { y: 0.5 },
            colors: ['#1d4ed8', '#e11d48', '#fbbf24', '#ffffff', '#10b981'],
          });
        } else {
          setPreRegistered(false);
          setWalkinSource("not_found");
          setStep(2);
        }
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to connect to the lookup service. Please proceed as walk-in.", variant: "destructive" });
        setPreRegistered(false);
        setStep(2);
      }
    });
  };

  const handleSubmit = () => {
    if (!preRegistered && !lastName.trim()) {
      toast({ title: "Missing info", description: "Last name is required for new walk-ins.", variant: "destructive" });
      return;
    }

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || "Unknown",
      email: email.trim(),
      phone: phone.trim() || null,
      preRegistered,
      mobilizeId,
      roles: roles.filter(r => r.wantsToServeToday).map(r => ({ roleName: r.roleName, isTrained: r.isTrained }))
    };

    const hadExperienceButDeclined = roles.some(r => (r.hasServed || r.isTrained) && !r.wantsToServeToday);

    submitMutation.mutate({ data: payload }, {
      onSuccess: () => {
        setStep(hadExperienceButDeclined ? "fun" : 4);
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#1d4ed8', '#e11d48', '#fbbf24', '#ffffff', '#000000']
        });
      },
      onError: (err) => {
        toast({ title: "Check-in failed", description: err.message || "Please try again.", variant: "destructive" });
      }
    });
  };

  // Auto-advance from "found" celebration to roles
  useEffect(() => {
    if (step === "found") {
      const timer = setTimeout(() => setStep(3), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step]);

  // Auto-advance from "fun" screen to YOU'RE IN
  useEffect(() => {
    if (step === "fun") {
      const timer = setTimeout(() => setStep(4), 3500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step]);

  // Auto-reset on success step
  useEffect(() => {
    if (step === 4) {
      const timer = setTimeout(handleReset, 6000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [step]);

  const renderRoleCard = (
    id: AttendeeRoleRoleName,
    title: string,
    Icon: React.ElementType,
    description: string
  ) => {
    const role = roles.find(r => r.roleName === id)!;
    const isEligible = role.hasServed || role.isTrained;

    const updateRole = (updates: Partial<RoleState>) => {
      setRoles(prev => prev.map(r => {
        if (r.roleName !== id) return r;
        const next = { ...r, ...updates };
        // Clear "serve today" if they uncheck both experience fields
        if (!next.hasServed && !next.isTrained) next.wantsToServeToday = false;
        return next;
      }));
    };

    return (
      <Card className={`relative overflow-hidden transition-all duration-300 ${role.wantsToServeToday ? 'ring-4 ring-primary' : ''}`}>
        <div className={`absolute top-0 left-0 w-3 h-full ${role.wantsToServeToday ? 'bg-primary' : isEligible ? 'bg-secondary' : 'bg-muted'}`} />
        <CardContent className="pt-6 pl-10 pr-6 pb-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-xl border-4 border-foreground shadow-brutal-sm ${role.wantsToServeToday ? 'bg-primary text-white' : isEligible ? 'bg-secondary text-foreground' : 'bg-muted text-muted-foreground'}`}>
              <Icon className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <div>
              <h3 className="font-display text-2xl md:text-3xl">{title}</h3>
              <p className="text-muted-foreground font-medium text-base leading-tight mt-1">{description}</p>
            </div>
          </div>

          <div className="space-y-3 bg-gray-50 p-4 rounded-xl border-2 border-border/50">
            <Checkbox
              label={`I've served as a ${title} before (with any group)`}
              checked={role.hasServed}
              onChange={(e) => updateRole({ hasServed: e.target.checked })}
            />
            <Checkbox
              label={`I've received training for this role`}
              checked={role.isTrained}
              onChange={(e) => updateRole({ isTrained: e.target.checked })}
            />
          </div>

          <AnimatePresence>
            {isEligible && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="border-4 border-primary rounded-xl bg-primary/5 p-4 space-y-3">
                  <p className="font-bold text-base leading-snug">
                    Would you like to join us today as a <span className="text-primary">{title}</span>? We promise to take good care of you — and we'd love to have you on the team! 🎉
                  </p>
                  <p className="text-sm font-medium text-muted-foreground">
                    <strong>BONUS:</strong> There's a cool NK3 button for our volunteers!
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => updateRole({ wantsToServeToday: true })}
                      className={`flex-1 py-2 px-4 rounded-lg border-4 border-foreground font-display text-lg transition-all ${role.wantsToServeToday ? 'bg-primary text-white shadow-brutal-sm' : 'bg-white hover:bg-primary/10'}`}
                    >
                      Yes, I'm in!
                    </button>
                    <button
                      onClick={() => updateRole({ wantsToServeToday: false })}
                      className={`flex-1 py-2 px-4 rounded-lg border-4 border-foreground font-display text-lg transition-all ${!role.wantsToServeToday ? 'bg-foreground text-white shadow-brutal-sm' : 'bg-white hover:bg-gray-100'}`}
                    >
                      Not today
                    </button>
                  </div>
                  <AnimatePresence>
                    {role.wantsToServeToday && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-sm font-bold text-primary pt-1"
                      >
                        After check-in, please come up to the table and ask for a member of the safety team — they'll get you sorted!
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    );
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
          {(step === 2 || step === 3) && (
            <Button variant="outline" onClick={() => setStep(step === 3 ? (preRegistered ? 1 : 2) : 1)} size="sm" className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white">
              <ArrowLeft className="w-5 h-5 mr-2" /> Back
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-6 md:p-12 flex flex-col justify-center">
        <AnimatePresence mode="wait" initial={false}>
          
          {/* STEP 1: INITIAL LOOKUP */}
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4 mb-12">
                <h2 className="font-display text-5xl md:text-7xl text-primary">Welcome!</h2>
                <p className="text-2xl md:text-3xl font-medium text-muted-foreground">Let's get you checked in to the rally.</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">First Name</label>
                  <Input 
                    placeholder="Enter your first name" 
                    icon={<UserPlus className="w-8 h-8" />}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="font-display text-xl uppercase tracking-wider mb-2 block">Email Address</label>
                  <Input 
                    placeholder="Enter your email" 
                    type="email"
                    icon={<Mail className="w-8 h-8" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <Button 
                  size="xl" 
                  className="w-full group"
                  onClick={handleLookup}
                  isLoading={lookupMutation.isPending}
                >
                  Find My Pre-Registration
                  <ArrowRight className="ml-3 w-7 h-7 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  size="xl"
                  variant="secondary"
                  className="w-full group border-4 border-foreground shadow-brutal"
                  onClick={() => {
                    if (!firstName.trim() || !email.trim()) {
                      toast({ title: "Hold up!", description: "We need your first name and email first.", variant: "destructive" });
                      return;
                    }
                    setPreRegistered(false);
                    setWalkinSource("direct");
                    setStep(2);
                  }}
                >
                  Register Me
                  <UserPlus className="ml-3 w-7 h-7" />
                </Button>
              </div>
              <p className="text-center text-muted-foreground font-medium text-base mt-3">
                Pre-registered on Mobilize? Use the first button. New to the rally? Use the second.
              </p>
            </motion.div>
          )}

          {/* FOUND: Pre-registration celebration */}
          {step === "found" && (
            <motion.div
              key="found"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="w-full max-w-2xl mx-auto text-center space-y-8 py-8"
            >
              {/* Big smiley */}
              <motion.div
                initial={{ rotate: -20, scale: 0 }}
                animate={{ rotate: [0, -10, 10, -5, 5, 0], scale: 1 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1, rotate: { repeat: 0 } }}
                className="text-[8rem] md:text-[10rem] leading-none select-none"
              >
                😄
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4"
              >
                <h2 className="font-display text-5xl md:text-7xl text-primary leading-none">
                  WE FOUND YOU!
                </h2>
                <p className="font-display text-3xl md:text-5xl text-foreground leading-tight">
                  WELCOME TO<br />NO KINGS 3, {firstName.toUpperCase()}!
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center justify-center gap-3 text-muted-foreground font-bold text-lg"
              >
                <PartyPopper className="w-6 h-6 text-primary" />
                <span>You're pre-registered — continuing in a moment…</span>
                <PartyPopper className="w-6 h-6 text-primary" />
              </motion.div>
            </motion.div>
          )}

          {/* STEP 2: WALK-IN LAST NAME */}
          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4 mb-12">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-secondary rounded-full border-4 border-foreground shadow-brutal-sm mb-4">
                  <UserPlus className="w-10 h-10 text-foreground" />
                </div>
                {walkinSource === "direct" ? (
                  <>
                    <h2 className="font-display text-4xl md:text-5xl">Hi {firstName}, welcome!</h2>
                    <p className="text-xl md:text-2xl font-medium text-muted-foreground">
                      Just a little more info and you'll be all set.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-4xl md:text-5xl">No worries, {firstName}!</h2>
                    <p className="text-xl md:text-2xl font-bold text-muted-foreground">
                      We didn't find your pre-registration — but don't sweat it.
                    </p>
                    <p className="text-lg md:text-xl font-medium text-muted-foreground">
                      We can get you checked in and ready to rally in about 2 seconds flat. 🎉
                    </p>
                  </>
                )}
              </div>

              <div>
                <label className="font-display text-xl uppercase tracking-wider mb-2 block">Last Name</label>
                <Input 
                  placeholder="Enter your last name" 
                  icon={<UserPlus className="w-8 h-8" />}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setStep(3)}
                  autoFocus
                />
              </div>

              <div>
                <label className="font-display text-xl uppercase tracking-wider mb-2 block">
                  Phone Number <span className="text-muted-foreground font-sans font-medium normal-case text-base">(optional)</span>
                </label>
                <Input 
                  placeholder="Enter your phone number" 
                  type="tel"
                  icon={<Phone className="w-8 h-8" />}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setStep(3)}
                />
              </div>

              <Button size="xl" className="w-full mt-8 group" onClick={() => setStep(3)}>
                Continue
                <ArrowRight className="ml-4 w-8 h-8 group-hover:translate-x-2 transition-transform" />
              </Button>
            </motion.div>
          )}

          {/* STEP 3: ROLES */}
          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-8 pb-20"
            >
              <div className="text-center space-y-2 mb-8">
                <h2 className="font-display text-4xl md:text-5xl">Volunteer Experience</h2>
                <p className="text-xl font-medium text-muted-foreground">Have you served in or been trained for any of these roles? (Check all that apply)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderRoleCard("safety_marshal", "Safety Marshal", Shield, "Guiding the crowd and ensuring general physical safety.")}
                {renderRoleCard("medic", "Medic", Activity, "Providing first aid and medical assistance if needed.")}
                {renderRoleCard("de_escalator", "De-escalator", HeartHandshake, "Diffusing tense situations and keeping the peace.")}
                {renderRoleCard("chant_lead", "Chant Lead", Megaphone, "Leading the crowd in chants and keeping energy high.")}
              </div>

              <div className="fixed bottom-0 left-0 w-full p-6 bg-white border-t-4 border-foreground z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                <div className="max-w-5xl mx-auto flex justify-between items-center gap-4">
                  <p className="hidden md:block font-display text-xl text-muted-foreground">
                    Ready to go, {firstName}?
                  </p>
                  <Button 
                    size="xl" 
                    className="w-full md:w-auto md:min-w-[300px] shadow-none hover:-translate-y-1 hover:shadow-[0_10px_0_0_#000]" 
                    onClick={handleSubmit}
                    isLoading={submitMutation.isPending}
                  >
                    Complete Check-in
                    <CheckCircle className="ml-4 w-8 h-8" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* FUN: No worries celebration screen */}
          {step === "fun" && (
            <motion.div
              key="fun"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="w-full max-w-2xl mx-auto text-center space-y-8 py-8"
            >
              <motion.div
                initial={{ rotate: -20, scale: 0 }}
                animate={{ rotate: [0, -10, 10, -5, 5, 0], scale: 1 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1 }}
                className="text-[8rem] md:text-[10rem] leading-none select-none"
              >
                🎉
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4"
              >
                <h2 className="font-display text-5xl md:text-7xl text-foreground leading-none">
                  NO WORRIES!
                </h2>
                <p className="font-display text-3xl md:text-4xl text-primary leading-snug">
                  WE'RE SO GLAD<br />YOU'RE HERE!
                </p>
                <p className="text-2xl font-bold text-muted-foreground">
                  Go have fun, {firstName}! 🎊
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl mx-auto text-center space-y-10 py-12"
            >
              <motion.div 
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
                className="w-40 h-40 mx-auto bg-green-500 rounded-full border-8 border-foreground shadow-brutal flex items-center justify-center"
              >
                <CheckCircle className="w-24 h-24 text-white" />
              </motion.div>
              
              <div className="space-y-4">
                <h2 className="font-display text-6xl md:text-8xl text-primary leading-none">
                  YOU'RE IN!
                </h2>
                <p className="text-3xl md:text-4xl font-bold">
                  Welcome to the rally, <span className="text-accent underline decoration-8 underline-offset-8">{firstName}</span>!
                </p>
                <p className="text-xl md:text-2xl font-medium text-muted-foreground">
                  Your check-in has been recorded. Let's make our voices heard!
                </p>
              </div>

              {/* Phone-specific call to action */}
              {isMobile && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="border-4 border-foreground rounded-2xl bg-secondary p-8 shadow-brutal space-y-3"
                >
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Smartphone className="w-8 h-8" />
                    <span className="font-display text-2xl">Next Step</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold leading-snug">
                    Show this screen at the sign-in desk to pick up your welcome gift.
                  </p>
                  <p className="text-base font-medium text-muted-foreground italic">
                    While supplies last — thank you for being here!
                  </p>
                </motion.div>
              )}

              {/* Tablet/volunteer view — reset button */}
              {!isMobile && (
                <div className="pt-4">
                  <Button size="lg" variant="outline" onClick={handleReset} className="text-xl">
                    Next Person (Auto-reset in 6s...)
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
