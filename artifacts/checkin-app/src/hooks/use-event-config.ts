import { useQuery } from "@tanstack/react-query";
import { eventApiBase } from "@/lib/event-slug";

export type EventRole = {
  key: string;
  displayName: string;
  sortOrder: number;
};

export type EventConfig = {
  id: number;
  name: string;
  slug: string;
  eventDate: string | null;
  giveawayEnabled: boolean;
  isActive: boolean;
  roles: EventRole[];
};

async function fetchEventConfig(): Promise<EventConfig> {
  const res = await fetch(`${eventApiBase()}/config`);
  if (!res.ok) throw new Error("Failed to load event config");
  return res.json() as Promise<EventConfig>;
}

export function useEventConfig() {
  return useQuery<EventConfig>({
    queryKey: ["event-config", eventApiBase()],
    queryFn: fetchEventConfig,
    staleTime: 5 * 60 * 1000,
  });
}
