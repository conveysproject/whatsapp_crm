/** Deep-link params for the inbox. Unknown values are ignored. */
export type InboxQuickFilter = "unread" | "assigned";

export interface InboxParams {
  conversationId: string | null;
  filter: InboxQuickFilter | null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseInboxParams(sp: { get(name: string): string | null } | null): InboxParams {
  const rawId = sp?.get("conversation") ?? null;
  const rawFilter = sp?.get("filter") ?? null;
  return {
    conversationId: rawId && ID_RE.test(rawId) ? rawId : null,
    filter: rawFilter === "unread" || rawFilter === "assigned" ? rawFilter : null,
  };
}

interface Filterable {
  unreadCount: number;
  assignedTo: string | null;
  status: string;
}

/** Client-side narrowing of an already-visible list; never adds items. */
export function applyQuickFilter<T extends Filterable>(
  items: T[],
  filter: InboxQuickFilter | null,
  currentUserId: string | null,
): T[] {
  if (filter === "unread") return items.filter((c) => c.unreadCount > 0);
  if (filter === "assigned") {
    if (!currentUserId) return [];
    return items.filter((c) => c.assignedTo === currentUserId && (c.status === "open" || c.status === "pending"));
  }
  return items;
}
