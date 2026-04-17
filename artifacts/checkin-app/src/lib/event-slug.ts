const APP_ROUTES = new Set(["admin", "checkin", "login", "index", "404"]);

export function getEventSlug(): string {
  if (import.meta.env.VITE_EVENT_SLUG) {
    return import.meta.env.VITE_EVENT_SLUG as string;
  }
  const pathSegment = window.location.pathname
    .split("/")
    .find(s => s.length > 0 && !APP_ROUTES.has(s));
  if (pathSegment) {
    return pathSegment;
  }
  return "nk3";
}

export function eventApiBase(): string {
  return `/api/events/${getEventSlug()}`;
}
