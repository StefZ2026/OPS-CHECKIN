import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import jsQR from "jsqr";

type ScanState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "loading" }
  | { phase: "success"; attendee: { firstName: string; lastName: string; email: string; preRegistered: boolean }; alreadyUsedToday: boolean }
  | { phase: "error"; message: string };

function extractToken(raw: string): string | null {
  const m = raw.match(/\/entry\/([0-9a-f]{40})/i);
  return m ? m[1] : null;
}

export default function ScanPage() {
  const params = useParams<{ eventSlug: string }>();
  const eventSlug = params.eventSlug ?? "nk3";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastTokenRef = useRef<string | null>(null);

  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const [camError, setCamError] = useState<string | null>(null);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState({ phase: "scanning" });
      tick();
    } catch (err) {
      setCamError("Camera access denied. Please allow camera permission and reload.");
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      const token = extractToken(code.data);
      if (token && token !== lastTokenRef.current) {
        lastTokenRef.current = token;
        handleToken(token);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  async function handleToken(token: string) {
    stopCamera();
    setState({ phase: "loading" });
    try {
      const resp = await fetch(`/api/events/${eventSlug}/check-in/scan/${token}`);
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setState({ phase: "error", message: data.error ?? "Scan failed" });
      } else {
        setState({ phase: "success", attendee: data.attendee, alreadyUsedToday: data.alreadyUsedToday });
      }
    } catch {
      setState({ phase: "error", message: "Network error — check your connection." });
    }
  }

  function reset() {
    lastTokenRef.current = null;
    setState({ phase: "idle" });
  }

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start p-4 pt-10 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Gate Scanner</h1>
        <p className="text-gray-400 text-sm mt-1">Scan an attendee's re-entry QR code.</p>
      </div>

      {camError && (
        <div className="bg-red-900 border border-red-600 rounded-xl px-5 py-4 text-center text-sm max-w-sm">
          {camError}
        </div>
      )}

      {state.phase === "idle" && !camError && (
        <button
          onClick={startCamera}
          className="mt-4 px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl text-lg font-semibold transition-colors"
        >
          Start Camera
        </button>
      )}

      {(state.phase === "scanning" || state.phase === "loading") && (
        <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black shadow-xl">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
          />
          {state.phase === "loading" && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-white text-lg font-semibold animate-pulse">Verifying…</div>
            </div>
          )}
          <div className="absolute inset-0 border-4 border-blue-400/40 rounded-2xl pointer-events-none" />
          <div className="absolute inset-8 border-2 border-blue-400 rounded-xl pointer-events-none" />
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {state.phase === "scanning" && (
        <p className="text-gray-400 text-sm text-center animate-pulse">
          Point camera at the attendee's QR code…
        </p>
      )}

      {state.phase === "success" && (
        <div className={`w-full max-w-sm rounded-2xl p-6 text-center shadow-xl ${state.alreadyUsedToday ? "bg-yellow-900 border border-yellow-500" : "bg-green-900 border border-green-500"}`}>
          <div className="text-4xl mb-3">{state.alreadyUsedToday ? "⚠️" : "✅"}</div>
          <h2 className="text-2xl font-bold">
            {state.attendee.firstName} {state.attendee.lastName}
          </h2>
          <p className="text-sm mt-1 opacity-70">{state.attendee.email}</p>
          {state.attendee.preRegistered && (
            <span className="inline-block mt-2 text-xs bg-white/20 rounded-full px-3 py-1">Pre-registered</span>
          )}
          <p className={`mt-4 font-semibold text-lg ${state.alreadyUsedToday ? "text-yellow-300" : "text-green-300"}`}>
            {state.alreadyUsedToday ? "Already scanned today — verify with staff." : "Entry approved!"}
          </p>
          <button
            onClick={reset}
            className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors"
          >
            Scan Next
          </button>
        </div>
      )}

      {state.phase === "error" && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-red-900 border border-red-500 shadow-xl">
          <div className="text-4xl mb-3">❌</div>
          <p className="font-semibold text-lg text-red-200">{state.message}</p>
          <button
            onClick={reset}
            className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
