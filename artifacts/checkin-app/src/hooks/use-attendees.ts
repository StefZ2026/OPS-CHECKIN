import { useListAttendees } from "@workspace/api-client-react";

export function useAttendees() {
  return useListAttendees({
    query: {
      // Auto-refresh the admin dashboard every 15 seconds
      refetchInterval: 15000,
    }
  });
}
