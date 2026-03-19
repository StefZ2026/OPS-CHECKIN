import { useLookupAttendee, useSubmitCheckIn } from "@workspace/api-client-react";

// We re-export the hooks to maintain the one-file-per-resource convention
// while utilizing the robust codegen hooks from the monorepo workspace.

export function useAttendeeLookup() {
  return useLookupAttendee();
}

export function useCheckInSubmit() {
  return useSubmitCheckIn();
}
