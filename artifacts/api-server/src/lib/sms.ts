// ── Telnyx SMS utility ────────────────────────────────────────────────────────
// Uses Telnyx REST API directly (no SDK dependency).
// Credentials are read from environment secrets:
//   TELNYX_API_KEY       — your Telnyx API key (starts with KEY)
//   TELNYX_FROM_NUMBER   — E.164 number to send from, e.g. +14045551234

const TELNYX_API_URL = "https://api.telnyx.com/v2/messages";

export interface SmsResult {
  ok: boolean;
  error?: string;
}

export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !fromNumber) {
    console.warn("[SMS] TELNYX_API_KEY or TELNYX_FROM_NUMBER not set — skipping SMS.");
    return { ok: false, error: "SMS credentials not configured" };
  }

  // Normalize phone: strip non-digits then add +1 if 10 digits (US)
  const digits = to.replace(/\D/g, "");
  const e164 = digits.startsWith("1") && digits.length === 11
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;

  try {
    const resp = await fetch(TELNYX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: fromNumber, to: e164, text }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[SMS] Telnyx error ${resp.status}:`, body);
      return { ok: false, error: `Telnyx ${resp.status}` };
    }

    console.log(`[SMS] Sent to ${e164}`);
    return { ok: true };
  } catch (err) {
    console.error("[SMS] Network error:", err);
    return { ok: false, error: String(err) };
  }
}
