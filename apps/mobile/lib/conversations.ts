import { ApiError } from "./api";

export type ConversationStatus = "open" | "pending" | "resolved" | "bot";
export type InboxTab = "all" | "open" | "pending" | "closed";
export type QuickFilter = "unread" | "assigned";
export interface ConversationContact { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] }
export interface ConversationLabel { id: string; name: string; color: string }
export interface ConversationItem {
  id: string;
  status: ConversationStatus;
  assignedTo: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  serviceWindowActive: boolean;
  contact: ConversationContact | null;
  lastMessage: { id: string; body: string | null; direction: "inbound" | "outbound"; contentType: string } | null;
  label: ConversationLabel | null;
}
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "expired" | "aborted";
export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  status: MessageStatus;
  sentAt: string;
  senderName: string | null;
  isSystemMessage: boolean;
}

export const PAGE_SIZE = 50;

/** The web's "Closed" tab is the `resolved` status in the API. */
export function statusParamFor(tab: InboxTab): ConversationStatus | undefined {
  if (tab === "all") return undefined;
  return tab === "closed" ? "resolved" : tab;
}

export function listPath(tab: InboxTab, labelId: string | null, page: number): string {
  const params = new URLSearchParams();
  const status = statusParamFor(tab);
  if (status) params.set("status", status);
  if (labelId) params.set("labelId", labelId);
  params.set("page", String(page));
  return `/conversations?${params.toString()}`;
}

/** Same rules as apps/web/lib/inbox-params.ts applyQuickFilter. */
export function applyQuickFilter(items: ConversationItem[], filter: QuickFilter | null, userId: string): ConversationItem[] {
  if (filter === "unread") return items.filter((c) => c.unreadCount > 0);
  if (filter === "assigned") return items.filter((c) => c.assignedTo === userId && (c.status === "open" || c.status === "pending"));
  return items;
}

export const keys = {
  list: (tab: InboxTab, labelId: string | null) => ["conversations", "list", tab, labelId ?? "none"] as const,
  search: (q: string) => ["conversations", "search", q] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["messages", id] as const,
};

export function contactName(c: ConversationContact | null): string {
  if (!c) return "Unknown contact";
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.phoneNumber;
}

const MEDIA_PREVIEW: Record<string, string> = {
  image: "Photo",
  audio: "Voice message",
  document: "Document",
  video: "Video",
  location: "Location",
};

export function previewText(m: { body: string | null; contentType: string } | null): string {
  if (!m) return "";
  if (m.body && m.body.trim()) return m.body;
  return MEDIA_PREVIEW[m.contentType] ?? "Message";
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whole hours left in WhatsApp's 24-hour customer-service window, or null when closed. */
export function windowHoursLeft(lastInboundAt: string | null, now: number): number | null {
  if (!lastInboundAt) return null;
  const left = Date.parse(lastInboundAt) + WINDOW_MS - now;
  return left > 0 ? Math.floor(left / 3_600_000) : null;
}

export function canSendFreeForm(c: Pick<ConversationItem, "serviceWindowActive">): boolean {
  return c.serviceWindowActive;
}

export function sendErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "That file is too large to send on WhatsApp.";
    switch (err.code) {
      case "BILLING_OVERDUE":
        return "Sending is paused because a WBMSG statement is overdue. An admin can pay it on the web dashboard.";
      case "ACCOUNT_CANCELLED":
        return "This workspace has been cancelled, so messages can't be sent.";
      case "TEMPLATE_NOT_APPROVED":
        return "Only approved templates can be sent.";
      case "TEMPLATE_NOT_FOUND":
        return "That template no longer exists.";
      case "WA_NOT_CONFIGURED":
      case "WHATSAPP_NOT_CONNECTED":
        return "WhatsApp isn't connected for this workspace.";
      case "NO_FILE":
        return "No file was attached.";
      case "NOT_FOUND":
        return "This conversation no longer exists.";
      case "NO_WA_CONTACT":
        return "This contact has no WhatsApp number.";
      case "FORBIDDEN":
        return "You don't have permission to send messages.";
    }
  }
  return "Couldn't send. Check your connection and try again.";
}
