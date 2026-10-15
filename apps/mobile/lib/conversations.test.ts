import { ApiError } from "./api";
import {
  applyQuickFilter, canSendFreeForm, contactName, keys, listPath, previewText, sendErrorMessage,
  statusParamFor, windowHoursLeft, type ConversationItem,
} from "./conversations";

const base: ConversationItem = {
  id: "c", status: "open", assignedTo: null, unreadCount: 0, lastMessageAt: null, lastInboundAt: null,
  serviceWindowActive: true, contact: null, lastMessage: null, label: null,
};

describe("list queries", () => {
  it("maps the Closed tab to status=resolved and All to no status", () => {
    expect(statusParamFor("all")).toBeUndefined();
    expect(statusParamFor("open")).toBe("open");
    expect(statusParamFor("pending")).toBe("pending");
    expect(statusParamFor("closed")).toBe("resolved");
  });
  it("builds the list path with status, label and page", () => {
    expect(listPath("all", null, 1)).toBe("/conversations?page=1");
    expect(listPath("closed", "l-1", 2)).toBe("/conversations?status=resolved&labelId=l-1&page=2");
  });
  it("keeps every conversation key under the ['conversations'] prefix and threads under ['messages', id]", () => {
    expect(keys.list("open", null)[0]).toBe("conversations");
    expect(keys.search("pri")[0]).toBe("conversations");
    expect(keys.detail("c-1")).toEqual(["conversations", "detail", "c-1"]);
    expect(keys.messages("c-1")).toEqual(["messages", "c-1"]);
  });
});

describe("applyQuickFilter (same rules as the web inbox)", () => {
  const items: ConversationItem[] = [
    { ...base, id: "a", unreadCount: 2, assignedTo: "u-1", status: "open" },
    { ...base, id: "b", unreadCount: 0, assignedTo: "u-1", status: "pending" },
    { ...base, id: "c", unreadCount: 1, assignedTo: "u-2", status: "open" },
    { ...base, id: "d", unreadCount: 0, assignedTo: "u-1", status: "resolved" },
  ];
  it("Unread keeps chats with unread messages", () => {
    expect(applyQuickFilter(items, "unread", "u-1").map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("Assigned to me keeps my open and pending chats", () => {
    expect(applyQuickFilter(items, "assigned", "u-1").map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("no filter keeps everything", () => {
    expect(applyQuickFilter(items, null, "u-1")).toHaveLength(4);
  });
});

describe("display helpers", () => {
  it("names a contact by first + last name, else phone", () => {
    expect(contactName({ id: "1", firstName: "Priya", lastName: "Shah", phoneNumber: "44", tags: [] })).toBe("Priya Shah");
    expect(contactName({ id: "1", firstName: null, lastName: null, phoneNumber: "+1 415", tags: [] })).toBe("+1 415");
    expect(contactName(null)).toBe("Unknown contact");
  });
  it("previews text or describes media", () => {
    expect(previewText({ body: "Hello", contentType: "text" })).toBe("Hello");
    expect(previewText({ body: null, contentType: "image" })).toBe("Photo");
    expect(previewText({ body: null, contentType: "audio" })).toBe("Voice message");
    expect(previewText({ body: null, contentType: "document" })).toBe("Document");
    expect(previewText({ body: null, contentType: "video" })).toBe("Video");
    expect(previewText({ body: null, contentType: "location" })).toBe("Location");
    expect(previewText({ body: null, contentType: "sticker" })).toBe("Message");
    expect(previewText(null)).toBe("");
  });
});

describe("24-hour window", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  it("reports whole hours left, or null when closed or never opened", () => {
    expect(windowHoursLeft("2026-10-16T11:00:00Z", now)).toBe(23);
    expect(windowHoursLeft("2026-10-15T11:00:00Z", now)).toBeNull();
    expect(windowHoursLeft(null, now)).toBeNull();
  });
  it("only allows free-form replies while the window is open", () => {
    expect(canSendFreeForm({ serviceWindowActive: true })).toBe(true);
    expect(canSendFreeForm({ serviceWindowActive: false })).toBe(false);
  });
});

describe("sendErrorMessage", () => {
  it("explains paused sending and closed accounts", () => {
    expect(sendErrorMessage(new ApiError(402, "BILLING_OVERDUE", "x"))).toMatch(/Sending is paused/);
    expect(sendErrorMessage(new ApiError(402, "ACCOUNT_CANCELLED", "x"))).toMatch(/cancelled/);
  });
  it("explains template and connection problems", () => {
    expect(sendErrorMessage(new ApiError(400, "TEMPLATE_NOT_APPROVED", "x"))).toBe("Only approved templates can be sent.");
    expect(sendErrorMessage(new ApiError(400, "WHATSAPP_NOT_CONNECTED", "x"))).toBe("WhatsApp isn't connected for this workspace.");
    expect(sendErrorMessage(new ApiError(403, "FORBIDDEN", "x"))).toBe("You don't have permission to send messages.");
  });
  it("explains upload and missing-conversation problems", () => {
    expect(sendErrorMessage(new ApiError(400, "WA_NOT_CONFIGURED", "x"))).toBe("WhatsApp isn't connected for this workspace.");
    expect(sendErrorMessage(new ApiError(400, "NO_FILE", "x"))).toBe("No file was attached.");
    expect(sendErrorMessage(new ApiError(413, "PAYLOAD_TOO_LARGE", "x"))).toBe("That file is too large to send on WhatsApp.");
    expect(sendErrorMessage(new ApiError(413, "WHATEVER", "x"))).toBe("That file is too large to send on WhatsApp.");
    expect(sendErrorMessage(new ApiError(404, "NOT_FOUND", "x"))).toBe("This conversation no longer exists.");
  });
  it("falls back to a neutral message", () => {
    expect(sendErrorMessage(new TypeError("Network request failed"))).toBe("Couldn't send. Check your connection and try again.");
    expect(sendErrorMessage(new ApiError(500, "INTERNAL", "boom"))).toBe("Couldn't send. Check your connection and try again.");
  });
});
