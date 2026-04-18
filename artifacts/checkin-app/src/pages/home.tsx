import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Logo from "../components/Logo";

const FEATURES = [
  {
    icon: "📱",
    title: "Works on Any Device",
    desc: "Kiosk-ready on tablets and phones. No app download required.",
  },
  {
    icon: "🙋",
    title: "Volunteer Pipeline",
    desc: "Identify, track, and follow up with volunteers automatically at every event.",
  },
  {
    icon: "🎭",
    title: "Role-Based Sign-Ups",
    desc: "Greeters, staff, marshals — assign and track roles right at the door.",
  },
  {
    icon: "📊",
    title: "Real-Time Exports",
    desc: "Download your attendee data as XLSX or CSV the moment doors close.",
  },
  {
    icon: "🏛️",
    title: "Multi-Event & Multi-Org",
    desc: "One platform for your whole organization across every event and campaign.",
  },
  {
    icon: "🔁",
    title: "Multi-Day Re-Entry",
    desc: "Attendees get a QR code by text on day one. Scan it for instant re-entry on day two.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Set Up Your Event",
    desc: "Create your event and share an event code. Takes two minutes.",
  },
  {
    num: "02",
    title: "Share the Link or QR Code",
    desc: "Print a QR code, text the link, or set up a tablet kiosk at the door.",
  },
  {
    num: "03",
    title: "Everyone Checks In",
    desc: "Attendees and volunteers check in on any device. You see the data live.",
  },
];

const FOR_ORGS = [
  { emoji: "🗳️", label: "Political Campaigns & Candidates" },
  { emoji: "🏘️", label: "Community Organizations & Nonprofits" },
  { emoji: "📣", label: "Issue Advocacy & Coalitions" },
  { emoji: "🎟️", label: "Conferences, Meetups & Live Events" },
];

const TESTIMONIALS = [
  {
    quote: "This was fantastic — so easy to check in. Took two seconds. This was great!",
    name: "Priscilla N.",
    role: "Volunteer, NK3 Rally",
  },
  {
    quote: "That worked great. So much better than how we did it last time. Thanks so much!",
    name: "Gail P.",
    role: "Organizer, NK3 Rally",
  },
];

export default function HomePage() {
  const [attendeeCode, setAttendeeCode] = useState("");
  const [managerCode, setManagerCode] = useState("");
  const [, navigate] = useLocation();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  function handleAttendeeGo(e: React.FormEvent) {
    e.preventDefault();
    const slug = attendeeCode.trim().toLowerCase();
    if (slug) navigate(`/${slug}`);
  }

  function handleManagerGo(e: React.FormEvent) {
    e.preventDefault();
    const slug = managerCode.trim().toLowerCase();
    if (slug) navigate(`/${slug}/admin`);
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* ── Nav ── */}
      <nav className="border-b-4 border-foreground bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo className="h-9 w-auto" variant="color" />
          <div className="flex items-center gap-3">
            <a
              href="/checkin-app/superadmin"
              className="text-foreground/60 hover:text-foreground text-sm font-semibold transition-colors hidden sm:block"
            >
              Platform Admin
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-primary border-b-4 border-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="font-display text-white text-4xl sm:text-6xl lg:text-7xl uppercase leading-none tracking-tight mb-6">
            Show up.{" "}
            <span className="text-secondary">Check in.</span>{" "}
            Get to work.
          </h1>
          <p className="text-white/90 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            OpsCheckIn is the event check-in platform built for organizations
            that run events — from community gatherings to large-scale campaigns.
          </p>

          {/* Entry cards */}
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {/* Attendee/Volunteer */}
            <div className="bg-background border-4 border-foreground shadow-brutal p-5 text-left">
              <p className="font-display text-sm uppercase tracking-widest text-foreground mb-3">
                Attendee or Volunteer?
              </p>
              <form onSubmit={handleAttendeeGo} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter event code"
                  value={attendeeCode}
                  onChange={(e) => setAttendeeCode(e.target.value)}
                  className="flex-1 border-2 border-foreground px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="bg-primary text-white border-2 border-foreground px-4 py-2 font-display uppercase text-sm shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal transition-all"
                >
                  Go →
                </button>
              </form>
            </div>

            {/* Org / Event Manager */}
            <div className="bg-secondary border-4 border-foreground shadow-brutal p-5 text-left">
              <p className="font-display text-sm uppercase tracking-widest text-foreground mb-3">
                Event or Campaign Manager?
              </p>
              <form onSubmit={handleManagerGo} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter event code"
                  value={managerCode}
                  onChange={(e) => setManagerCode(e.target.value)}
                  className="flex-1 border-2 border-foreground px-3 py-2 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="bg-foreground text-white border-2 border-foreground px-4 py-2 font-display uppercase text-sm shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal transition-all"
                >
                  Go →
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-b-4 border-foreground bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="font-display text-3xl sm:text-4xl uppercase text-center mb-12">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-0 border-4 border-foreground shadow-brutal">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`p-8 ${i < STEPS.length - 1 ? "border-b-4 sm:border-b-0 sm:border-r-4 border-foreground" : ""}`}
              >
                <div className="font-display text-5xl text-primary/20 mb-2">
                  {step.num}
                </div>
                <h3 className="font-display text-lg uppercase mb-3">
                  {step.title}
                </h3>
                <p className="text-foreground/70 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built for ── */}
      <section className="border-b-4 border-foreground bg-secondary">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="font-display text-3xl sm:text-4xl uppercase text-center mb-10">
            Built for your organization
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FOR_ORGS.map((org) => (
              <div
                key={org.label}
                className="bg-background border-4 border-foreground p-6 shadow-brutal text-center"
              >
                <div className="text-4xl mb-3">{org.emoji}</div>
                <p className="font-display text-sm uppercase leading-snug">
                  {org.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-b-4 border-foreground bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="font-display text-3xl sm:text-4xl uppercase text-center mb-12">
            Everything you need at the door
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="border-4 border-foreground p-6 shadow-brutal-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal transition-all"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-display text-base uppercase mb-2">
                  {f.title}
                </h3>
                <p className="text-foreground/70 text-sm leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-b-4 border-foreground bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="font-display text-3xl sm:text-4xl uppercase text-white mb-10">
            What people are saying
          </h2>

          <div className="relative">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className={`transition-all duration-500 ${i === activeTestimonial ? "opacity-100" : "opacity-0 absolute inset-0"}`}
              >
                <blockquote className="bg-white/10 border-4 border-white/30 p-8 sm:p-12 text-left">
                  <p className="text-white text-lg sm:text-2xl font-display leading-relaxed mb-6">
                    "{t.quote}"
                  </p>
                  <footer className="text-white/70 text-sm uppercase tracking-widest font-display">
                    — {t.name}, {t.role}
                  </footer>
                </blockquote>
              </div>
            ))}
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-3 mt-8">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTestimonial(i)}
                className={`w-3 h-3 border-2 border-white transition-all ${i === activeTestimonial ? "bg-white" : "bg-transparent"}`}
                aria-label={`Testimonial ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-b-4 border-foreground bg-accent">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="font-display text-3xl sm:text-4xl uppercase text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-white/90 mb-8 max-w-lg mx-auto">
            Get your organization set up and your first event live. Reach out to request access.
          </p>
          <a
            href="mailto:hello@opscheckin.com"
            className="inline-block bg-white text-foreground border-4 border-foreground font-display uppercase text-lg px-8 py-4 shadow-brutal hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_hsl(var(--foreground))] transition-all"
          >
            Request Access →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-foreground border-t-4 border-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo className="h-7 w-auto" variant="white" />
          <p className="text-white/50 text-xs text-center">
            Show Up. Check In. Get to Work. © {new Date().getFullYear()} OpsCheckIn
          </p>
          <div className="flex gap-4 text-xs">
            <a
              href="mailto:hello@opscheckin.com"
              className="text-white/60 hover:text-white transition-colors"
            >
              Contact
            </a>
            <a
              href="/checkin-app/superadmin"
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              Platform Admin
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
