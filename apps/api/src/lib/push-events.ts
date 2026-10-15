import type { PushPayload } from "./push.js";

const MEDIA_LABEL: Record<string, string> = {
  audio: "Voice message",
  image: "Image",
  video: "Video",
  document: "Document",
  location: "Location",
};

export function newMessagePush(args: { contactName: string; body: string | null; contentType: string; conversationId: string }): PushPayload {
  const text = args.body && args.body.trim().length > 0 ? args.body : (MEDIA_LABEL[args.contentType] ?? "New message");
  return { title: args.contactName, body: text, data: { type: "new_message", conversationId: args.conversationId } };
}

export function closureOverduePush(args: { contactLabel: string; contactId: string }): PushPayload {
  return {
    title: "Lead closure overdue",
    body: `${args.contactLabel} passed its closure deadline without being closed.`,
    data: { type: "closure_overdue", contactId: args.contactId },
  };
}
