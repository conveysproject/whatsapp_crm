import { describe, it, expect } from "vitest";
import { parseInboxParams, applyQuickFilter, resolveDeepLinkSelection } from "./inbox-params";

describe("parseInboxParams", () => {
  it("parses conversation and filter", () => {
    expect(parseInboxParams(new URLSearchParams("conversation=abc123&filter=unread"))).toEqual({
      conversationId: "abc123",
      filter: "unread",
    });
    expect(parseInboxParams(new URLSearchParams("filter=assigned")).filter).toBe("assigned");
  });
  it("ignores unknown or unsupported values", () => {
    expect(parseInboxParams(new URLSearchParams("filter=unanswered"))).toEqual({ conversationId: null, filter: null });
    expect(parseInboxParams(new URLSearchParams("filter=__proto__&conversation="))).toEqual({ conversationId: null, filter: null });
    expect(parseInboxParams(new URLSearchParams("conversation=../x%20y")).conversationId).toBeNull();
    expect(parseInboxParams(null)).toEqual({ conversationId: null, filter: null });
  });
});

describe("applyQuickFilter", () => {
  const items = [
    { id: "1", unreadCount: 2, assignedTo: "me", status: "open" },
    { id: "2", unreadCount: 0, assignedTo: "me", status: "pending" },
    { id: "3", unreadCount: 1, assignedTo: null, status: "open" },
    { id: "4", unreadCount: 0, assignedTo: "me", status: "closed" },
  ];
  it("filters unread", () => expect(applyQuickFilter(items, "unread", "me").map((c) => c.id)).toEqual(["1", "3"]));
  it("filters assigned to current user", () => expect(applyQuickFilter(items, "assigned", "me").map((c) => c.id)).toEqual(["1", "2"]));
  it("assigned with unknown user yields none", () => expect(applyQuickFilter(items, "assigned", null)).toEqual([]));
  it("null filter passes through", () => expect(applyQuickFilter(items, null, "me")).toHaveLength(4));
});

describe("resolveDeepLinkSelection", () => {
  it("does not consume when id is not in the list, selects once it appears", () => {
    let consumed: string | null = null;
    const step = (ids: string[] | undefined, url: string | null) => {
      const r = resolveDeepLinkSelection(url, consumed, ids);
      if (r) consumed = r;
      return r;
    };
    expect(step(["x"], "a")).toBeNull();
    expect(consumed).toBeNull();
    expect(step(["x", "a"], "a")).toBe("a");
    expect(step(["x", "a"], "a")).toBeNull();
    expect(step(["x", "a", "b"], "b")).toBe("b");
  });
  it("waits for the list and ignores missing url id", () => {
    expect(resolveDeepLinkSelection("a", null, undefined)).toBeNull();
    expect(resolveDeepLinkSelection(null, null, ["a"])).toBeNull();
  });
});
