import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import jsQR from "jsqr";

type AttendeeInfo = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  preRegistered: boolean;
};

type GateState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "scanning" }
  | { phase: "loading" }
  | { phase: "CLEARED"; attendee: AttendeeInfo; passType: string }
  | { phase: "ALREADY_ADMITTED"; attendee: AttendeeInfo; passType: string }
  | { phase: "NOT_FOUND"; passType: string }
  | { phase: "NOT_COVERED"; reason: string; passType: string }
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

  const [state, setState] = useState<GateState>({ phase: "idle" });
  const [camError, setCamError] = useState<string | null>(null);

  async function startCamera() {
    setCamError(null);
    setState({ phase: "starting" });
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
    } catch {
      setCamError("Camera access denied. Tap below to retry.");
      setState({ phase: "idle" });
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
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
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
      const data = await resp.json() as {
        ok: boolean;
        state?: "CLEARED" | "ALREADY_ADMITTED" | "NOT_FOUND" | "NOT_COVERED" | "ERROR";
        passType?: string;
        attendee?: AttendeeInfo;
        error?: string;
      };

      const pt = data.passType ?? "WRISTBAND";

      if (data.state === "CLEARED" && data.attendee) {
        setState({ phase: "CLEARED", attendee: data.attendee, passType: pt });
      } else if (data.state === "ALREADY_ADMITTED" && data.attendee) {
        setState({ phase: "ALREADY_ADMITTED", attendee: data.attendee, passType: pt });
      } else if (data.state === "NOT_FOUND" || resp.status === 404) {
        setState({ phase: "NOT_FOUND", passType: pt });
      } else if (data.state === "NOT_COVERED" || resp.status === 403) {
        setState({ phase: "NOT_COVERED", reason: data.error ?? "Pass does not cover today's session.", passType: pt });
      } else {
        setState({ phase: "error", message: data.error ?? "Unexpected response from server." });
      }
    } catch {
      setState({ phase: "error", message: "Network error — check your connection." });
    }
  }

  function reset() {
    lastTokenRef.current = null;
    startCamera();
  }

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCameraVisible =
    state.phase === "starting" || state.phase === "scanning" || state.phase === "loading";

  const hasResult =
    state.phase === "CLEARED" ||
    state.phase === "ALREADY_ADMITTED" ||
    state.phase === "NOT_FOUND" ||
    state.phase === "NOT_COVERED" ||
    state.phase === "error";

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start p-4 pt-8 gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Gate Scanner</h1>
        <p className="text-gray-400 text-sm mt-1">
          Scan an attendee's re-entry QR code.
        </p>
      </div>

      {camError && (
        <div className="bg-red-900 border border-red-600 rounded-xl px-5 py-4 text-center text-sm max-w-sm">
          {camError}
          <button
            onClick={startCamera}
            className="block mx-auto mt-3 px-5 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-medium"
          >
            Retry Camera
          </button>
        </div>
      )}

      {isCameraVisible && (
        <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black shadow-xl">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
          />
          {(state.phase === "starting" || state.phase === "loading") && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-white text-lg font-semibold animate-pulse">
                {state.phase === "starting" ? "Starting camera…" : "Verifying…"}
              </div>
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

      {/* ── CLEARED ─────────────────────────────────────────────────── */}
      {state.phase === "CLEARED" && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-green-900 border border-green-500 shadow-xl">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-2xl font-bold">
            {state.attendee.firstName} {state.attendee.lastName}
          </h2>
          <p className="text-sm mt-1 opacity-70">{state.attendee.email}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="inline-block text-xs bg-green-700 rounded-full px-3 py-1 font-mono uppercase">
              {state.passType}
            </span>
            {state.attendee.preRegistered && (
              <span className="inline-block text-xs bg-white/20 rounded-full px-3 py-1">
                Pre-registered
              </span>
            )}
          </div>
          <p className="mt-4 font-bold text-xl text-green-300">Entry approved!</p>
          <button onClick={reset} className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors">
            Scan Next
          </button>
        </div>
      )}

      {/* ── ALREADY_ADMITTED ────────────────────────────────────────── */}
      {state.phase === "ALREADY_ADMITTED" && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-yellow-900 border border-yellow-500 shadow-xl">
          <div className="text-5xl mb-3">⚠️</div>
          <h2 className="text-2xl font-bold">
            {state.attendee.firstName} {state.attendee.lastName}
          </h2>
          <p className="text-sm mt-1 opacity-70">{state.attendee.email}</p>
          <span className="inline-block mt-2 text-xs bg-yellow-700 rounded-full px-3 py-1 font-mono uppercase">
            {state.passType}
          </span>
          <p className="mt-4 font-bold text-xl text-yellow-300">Already admitted today</p>
          <p className="text-yellow-200 text-sm mt-1">
            This QR code was already scanned today. Verify with a supervisor before granting re-entry.
          </p>
          <button onClick={reset} className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors">
            Scan Next
          </button>
        </div>
      )}

      {/* ── NOT_COVERED (event ended / session not applicable) ──────── */}
      {state.phase === "NOT_COVERED" && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-orange-900 border border-orange-500 shadow-xl">
          <div className="text-5xl mb-3">🚷</div>
          <p className="font-bold text-xl text-orange-200">Pass not valid for this session</p>
          <span className="inline-block mt-2 text-xs bg-orange-700 rounded-full px-3 py-1 font-mono uppercase">
            {state.passType}
          </span>
          <p className="text-orange-300 text-sm mt-3">{state.reason}</p>
          <p className="text-gray-400 text-xs mt-2">
            Follow off-list policy — direct attendee to the check-in desk.
          </p>
          <button onClick={reset} className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors">
            Scan Next
          </button>
        </div>
      )}

      {/* ── NOT_FOUND (off-list) ────────────────────────────────────── */}
      {state.phase === "NOT_FOUND" && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-gray-800 border border-gray-600 shadow-xl">
          <div className="text-5xl mb-3">🚫</div>
          <p className="font-bold text-xl text-gray-200">Pass not recognised</p>
          <p className="text-gray-400 text-sm mt-2">
            This QR code is not on the attendee list for this event. Follow off-list policy — direct to the check-in desk.
          </p>
          <button onClick={reset} className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors">
            Scan Next
          </button>
        </div>
      )}

      {/* ── Generic error ───────────────────────────────────────────── */}
      {state.phase === "error" && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-red-900 border border-red-500 shadow-xl">
          <div className="text-4xl mb-3">❌</div>
          <p className="font-semibold text-lg text-red-200">{state.message}</p>
          <button onClick={reset} className="mt-5 px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
