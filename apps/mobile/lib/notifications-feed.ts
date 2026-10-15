export interface FeedItem { id: string; type: string; message: string | null; action: string | null; readAt: string | null; createdAt: string }

/** The API stores web paths in `action` (e.g. /inbox?conversation=<id>); map them to app routes. */
export function routeForNotificationAction(type: string, action: string | null): string | null {
  if (type === "new_message" || type === "conversation_assigned") {
    const m = action ? /[?&]conversation=([^&]+)/.exec(action) : null;
    return m?.[1] ? `/conversation/${decodeURIComponent(m[1])}` : null;
  }
  if (type === "closure_overdue") return "/contacts";
  return null;
}

export function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
