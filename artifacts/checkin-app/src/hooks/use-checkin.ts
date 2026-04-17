import { useMutation } from "@tanstack/react-query";
import { eventApiBase } from "@/lib/event-slug";
import type { LookupRequest, LookupResult, CheckInRequest, CheckInResponse } from "@workspace/api-client-react";

async function lookupAttendee(data: LookupRequest): Promise<LookupResult> {
  const res = await fetch(`${eventApiBase()}/check-in/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json() as LookupResult & { error?: string };
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error ?? "Lookup failed") as Error & { data?: unknown };
    err.data = body;
    throw err;
  }
  return body;
}

async function submitCheckIn(data: CheckInRequest): Promise<CheckInResponse> {
  const res = await fetch(`${eventApiBase()}/check-in/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json() as CheckInResponse & { error?: string };
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error ?? "Check-in failed") as Error & { data?: unknown };
    err.data = body;
    throw err;
  }
  return body;
}

export function useAttendeeLookup() {
  return useMutation<LookupResult, Error & { data?: unknown }, { data: LookupRequest }>({
    mutationFn: ({ data }) => lookupAttendee(data),
  });
}

export function useCheckInSubmit() {
  return useMutation<CheckInResponse, Error & { data?: unknown }, { data: CheckInRequest }>({
    mutationFn: ({ data }) => submitCheckIn(data),
  });
}
