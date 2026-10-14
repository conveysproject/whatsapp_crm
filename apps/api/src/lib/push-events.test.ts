import { describe, it, expect } from "vitest";
import { newMessagePush, closureOverduePush } from "./push-events.js";

describe("newMessagePush", () => {
  it("uses the contact name as title and the text as body", () => {
    expect(newMessagePush({ contactName: "Priya Shah", body: "Is my appointment on?", contentType: "text", conversationId: "c-1" })).toEqual({
      title: "Priya Shah",
      body: "Is my appointment on?",
      data: { type: "new_message", conversationId: "c-1" },
    });
  });

  it("describes media messages that have no text", () => {
    expect(newMessagePush({ contactName: "Ahmed", body: null, contentType: "audio", conversationId: "c-2" }).body).toBe("Voice message");
    expect(newMessagePush({ contactName: "Ahmed", body: null, contentType: "image", conversationId: "c-2" }).body).toBe("Image");
    expect(newMessagePush({ contactName: "Ahmed", body: "", contentType: "sticker", conversationId: "c-2" }).body).toBe("New message");
  });
});

describe("closureOverduePush", () => {
  it("points at the contact", () => {
    expect(closureOverduePush({ contactLabel: "Tom Becker", contactId: "ct-1" })).toEqual({
      title: "Lead closure overdue",
      body: "Tom Becker passed its closure deadline without being closed.",
      data: { type: "closure_overdue", contactId: "ct-1" },
    });
  });
});
