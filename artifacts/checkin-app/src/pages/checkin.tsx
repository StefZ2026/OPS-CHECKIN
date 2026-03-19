import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { UserPlus, Mail, Shield, Activity, HeartHandshake, Megaphone, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";
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
};

const INITIAL_ROLES: RoleState[] = [
  { roleName: "safety_marshal", hasServed: false, isTrained: false },
  { roleName: "medic", hasServed: false, isTrained: false },
  { roleName: "de_escalator", hasServed: false, isTrained: false },
  { roleName: "chant_lead", hasServed: false, isTrained: false },
];

export default function CheckInFlow() {
  const { toast } = useToast();
  
  type Step = 1 | 2 | 3 | 4;
  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [preRegistered, setPreRegistered] = useState(false);
  const [mobilizeId, setMobilizeId] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleState[]>(INITIAL_ROLES);

  const lookupMutation = useAttendeeLookup();
  const submitMutation = useCheckInSubmit();

  const handleReset = () => {
    setStep(1);
    setFirstName("");
    setLastName("");
    setEmail("");
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
          toast({ title: "Found you!", description: "You are pre-registered on Mobilize.", variant: "success" });
          setPreRegistered(true);
          setMobilizeId(data.mobilizeId ?? null);
          setStep(3); // Skip last name for pre-registered
        } else {
          setPreRegistered(false);
          setStep(2); // Ask for last name
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
      lastName: lastName.trim() || "Unknown", // Handle edge cases if pre-registered lacked last name
      email: email.trim(),
      preRegistered,
      mobilizeId,
      roles: roles.filter(r => r.hasServed).map(r => ({ roleName: r.roleName, isTrained: r.isTrained }))
    };

    submitMutation.mutate({ data: payload }, {
      onSuccess: () => {
        setStep(4);
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
    
    const updateRole = (updates: Partial<RoleState>) => {
      setRoles(prev => prev.map(r => r.roleName === id ? { ...r, ...updates } : r));
    };

    return (
      <Card className="relative overflow-hidden transition-all duration-300">
        <div className={`absolute top-0 left-0 w-3 h-full ${role.hasServed ? 'bg-primary' : 'bg-muted'}`} />
        <CardContent className="pt-6 pl-10 pr-6 pb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className={`p-4 rounded-xl border-4 border-foreground shadow-brutal-sm ${role.hasServed ? 'bg-secondary text-foreground' : 'bg-muted text-muted-foreground'}`}>
              <Icon className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <div>
              <h3 className="font-display text-2xl md:text-3xl">{title}</h3>
              <p className="text-muted-foreground font-medium text-lg leading-tight mt-1">{description}</p>
            </div>
          </div>
          
          <div className="space-y-4 bg-gray-50 p-4 rounded-xl border-2 border-border/50">
            <Checkbox 
              label={`I have served as a ${title} before`}
              checked={role.hasServed}
              onChange={(e) => updateRole({ hasServed: e.target.checked, isTrained: !e.target.checked ? false : role.isTrained })}
            />
            
            <AnimatePresence>
              {role.hasServed && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="pl-12 overflow-hidden"
                >
                  <Checkbox 
                    label="I have received formal training for this role"
                    checked={role.isTrained}
                    onChange={(e) => updateRole({ isTrained: e.target.checked })}
                    className="border-primary/20"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-white">
      {/* Header */}
      <header className="py-4 px-6 md:px-12 border-b-4 border-foreground bg-foreground flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <img src="/icu-logo.jpg" alt="Indivisible Cherokee United" className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover" />
          <div>
            <h1 className="font-display text-xl md:text-3xl text-white leading-tight">No Kings 3 Rally</h1>
            <p className="text-white/70 text-sm font-medium hidden md:block">March 28th · ICU Check-In</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <img src="/nk3-banner.png" alt="No Kings" className="h-10 md:h-12 w-auto object-contain flex-shrink-0" />
          {step > 1 && step < 4 && (
            <Button variant="outline" onClick={() => setStep(prev => Math.max(1, prev - 1) as Step)} size="sm" className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white">
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
                <h2 className="font-display text-4xl md:text-5xl">Welcome Walk-in!</h2>
                <p className="text-xl md:text-2xl font-medium text-muted-foreground">We didn't find a pre-registration. Let's add you right now.</p>
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
                <h2 className="font-display text-4xl md:text-5xl">Volunteer Roles</h2>
                <p className="text-xl font-medium text-muted-foreground">Are you able to help with any of these roles today?</p>
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

          {/* STEP 4: SUCCESS */}
          {step === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl mx-auto text-center space-y-12 py-20"
            >
              <motion.div 
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
                className="w-40 h-40 mx-auto bg-green-500 rounded-full border-8 border-foreground shadow-brutal flex items-center justify-center"
              >
                <CheckCircle className="w-24 h-24 text-white" />
              </motion.div>
              
              <div className="space-y-6">
                <h2 className="font-display text-6xl md:text-8xl text-primary leading-none">
                  YOU'RE IN!
                </h2>
                <p className="text-3xl md:text-4xl font-bold">
                  Thank you, <span className="text-accent underline decoration-8 underline-offset-8">{firstName}</span>.
                </p>
                <p className="text-xl md:text-2xl font-medium text-muted-foreground">
                  Your check-in has been recorded. Let's make our voices heard!
                </p>
              </div>

              <div className="pt-12">
                <Button size="lg" variant="outline" onClick={handleReset} className="text-xl">
                  Next Person (Auto-reset in 5s...)
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
