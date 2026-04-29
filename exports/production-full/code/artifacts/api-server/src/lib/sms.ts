// ── Telnyx SMS utility ────────────────────────────────────────────────────────
// Uses the official Telnyx Node SDK.
// Credentials are read from environment secrets:
//   TELNYX_API_KEY       — your Telnyx API key (starts with KEY...)
//   TELNYX_FROM_NUMBER   — E.164 number to send from, e.g. +14045551234

import Telnyx from "telnyx";

export interface SmsResult {
  ok: boolean;
  error?: string;
}

/** Normalize a raw phone string (digits-only or E.164) to E.164 format. */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/** Send an SMS via Telnyx. Returns ok:false (never throws) if credentials are
 *  missing or the Telnyx API returns an error — so callers can fire-and-forget. */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !fromNumber) {
    console.warn("[SMS] TELNYX_API_KEY or TELNYX_FROM_NUMBER not set — skipping SMS.");
    return { ok: false, error: "SMS credentials not configured" };
  }

  const e164 = toE164(to);
  const client = new Telnyx({ apiKey });

  try {
    await client.messages.send({ from: fromNumber, to: e164, text });
    console.log(`[SMS] Sent to ${e164}`);
    return { ok: true };
  } catch (err: unknown) {
    console.error("[SMS] Telnyx SDK error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
