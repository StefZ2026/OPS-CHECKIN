import { useParams, useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";

export default function EntryPage() {
  const params = useParams<{ eventSlug: string; token: string }>();
  const [location] = useLocation();

  const eventSlug = params.eventSlug ?? "unknown";
  const token = params.token ?? "";

  const entryUrl = `${window.location.origin}${window.location.pathname}`;

  if (!token || !/^[0-9a-f]{40}$/i.test(token)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-6">
        <div className="text-center">
          <p className="text-red-400 text-xl font-semibold">Invalid entry link.</p>
          <p className="text-gray-400 mt-2 text-sm">Please check your SMS and use the original link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white p-6 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Your Re-Entry QR Code</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Show this QR code to gate staff each day to re-enter.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-2xl">
        <QRCodeSVG
          value={entryUrl}
          size={260}
          level="M"
          includeMargin={false}
        />
      </div>

      <div className="text-center max-w-xs">
        <p className="text-yellow-300 font-semibold text-sm">
          Screenshot this page or keep this tab open.
        </p>
        <p className="text-gray-500 text-xs mt-2">
          One scan per day — good for the full duration of the event.
        </p>
      </div>

      <div className="mt-4 border border-gray-800 rounded-xl px-5 py-3 bg-gray-900 text-xs text-gray-400 text-center max-w-xs">
        Event: <span className="text-white font-mono">{eventSlug}</span>
        <br />
        Token: <span className="text-gray-600 font-mono">{token.slice(0, 8)}…</span>
      </div>
    </div>
  );
}
