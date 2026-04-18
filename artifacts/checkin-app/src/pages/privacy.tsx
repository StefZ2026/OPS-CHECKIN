import Logo from "../components/Logo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <nav className="border-b-4 border-foreground bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <a href="/checkin-app/">
            <Logo className="h-9 w-auto" variant="color" />
          </a>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-display text-4xl uppercase mb-2">Privacy Policy</h1>
        <p className="text-foreground/50 text-sm mb-10">Effective: April 2025</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="font-display text-xl uppercase mb-3">What We Collect</h2>
            <p>
              OpsCheckIn collects information that event organizers and attendees provide directly —
              such as name, email address, and phone number — as part of the check-in process.
              We also collect basic usage data (page visits, check-in timestamps) to operate the platform.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">How We Use It</h2>
            <p>
              Data collected is used solely to operate check-in functionality for the organization
              running the event. Attendee data is accessible to the event's authorized managers and
              is never sold or shared with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">SMS Communications</h2>
            <p>
              If an event uses SMS re-entry codes, your phone number may be used to send you a
              one-time text message with a QR code link for re-entry on subsequent event days.
              Message and data rates may apply. You are not opted into any ongoing marketing list.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Data Retention</h2>
            <p>
              Attendee records are retained for the duration of the event and a reasonable period
              thereafter for reporting purposes. Organizations may request deletion of their data
              by contacting us at <a href="mailto:hello@opscheckin.com" className="text-primary underline">hello@opscheckin.com</a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Security</h2>
            <p>
              We use industry-standard practices to protect your data, including encrypted connections
              and row-level access controls. No system is perfectly secure, but we take reasonable
              precautions to protect the information we hold.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Contact</h2>
            <p>
              Questions about this policy? Email us at{" "}
              <a href="mailto:hello@opscheckin.com" className="text-primary underline">hello@opscheckin.com</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-foreground border-t-4 border-foreground mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-center">
          <p className="text-white/50 text-xs">
            © {new Date().getFullYear()} OpsCheckIn — Show Up. Check In. Get to Work.
          </p>
        </div>
      </footer>
    </div>
  );
}
