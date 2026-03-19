import { useListAttendees, getListAttendeesQueryKey } from "@workspace/api-client-react";

export function useAttendees() {
  return useListAttendees({
    query: {
      queryKey: getListAttendeesQueryKey(),
      refetchInterval: 15000,
    },
  });
}
