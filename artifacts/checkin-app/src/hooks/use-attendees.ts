import { useListAttendees, getListAttendeesQueryKey } from "@workspace/api-client-react";
import { getAdminToken } from "./use-admin-auth";

export function useAttendees() {
  const token = getAdminToken();
  return useListAttendees({
    query: {
      queryKey: getListAttendeesQueryKey(),
      refetchInterval: 15000,
    },
    request: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}
