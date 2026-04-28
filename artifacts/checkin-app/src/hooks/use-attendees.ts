import { useQuery } from "@tanstack/react-query";
import { eventApiBase } from "@/lib/event-slug";
import type { AttendeeWithRoles } from "@workspace/api-client-react";

type AttendeeListResponse = {
  total: number;
  preRegisteredCount: number;
  walkInCount: number;
  attendees: AttendeeWithRoles[];
};

async function fetchAttendees(): Promise<AttendeeListResponse> {
  const res = await fetch(`${eventApiBase()}/attendees`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch attendees");
  return res.json() as Promise<AttendeeListResponse>;
}

export function useAttendees() {
  return useQuery<AttendeeListResponse>({
    queryKey: ["attendees", eventApiBase()],
    queryFn: fetchAttendees,
    refetchInterval: 15000,
  });
}
