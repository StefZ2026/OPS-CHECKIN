import { Link } from "wouter";
import Logo from "../components/Logo";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <nav className="border-b-4 border-foreground bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <Link href="/">
            <Logo className="h-9 w-auto" variant="color" />
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="font-display text-4xl uppercase mb-2">Terms of Service</h1>
        <p className="text-foreground/50 text-sm mb-10">Effective: April 2025</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/80 leading-relaxed">
          <section>
            <h2 className="font-display text-xl uppercase mb-3">Use of the Platform</h2>
            <p>
              OpsCheckIn provides event check-in software to organizations ("Organizations") and
              their attendees. By using OpsCheckIn, you agree to use it only for lawful purposes
              and in accordance with these terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Organization Responsibilities</h2>
            <p>
              Organizations are responsible for obtaining appropriate consent from attendees to
              collect and use their information through OpsCheckIn. Organizations agree not to use
              the platform to collect data for purposes beyond event management without attendee
              consent.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Attendee Data</h2>
            <p>
              Attendees provide their information voluntarily as part of the check-in process.
              This data is managed by the Organization running the event. OpsCheckIn acts as a
              data processor on behalf of the Organization and does not independently control
              attendee data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Service Availability</h2>
            <p>
              We aim to keep OpsCheckIn available and reliable, especially during active events.
              However, we do not guarantee uninterrupted service and are not liable for downtime
              or data loss beyond our reasonable control.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Modifications</h2>
            <p>
              We may update these terms from time to time. Continued use of the platform after
              changes constitutes acceptance of the revised terms. We will make reasonable efforts
              to notify Organizations of material changes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Limitation of Liability</h2>
            <p>
              OpsCheckIn is provided "as is." To the extent permitted by law, we are not liable
              for indirect, incidental, or consequential damages arising from your use of the
              platform.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl uppercase mb-3">Contact</h2>
            <p>
              Questions about these terms? Email us at{" "}
              <a href="mailto:info@opscheckin.com" className="text-primary underline">info@opscheckin.com</a>.
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
