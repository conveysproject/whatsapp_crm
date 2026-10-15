import { relativeTime, routeForNotificationAction } from "./notifications-feed";

describe("routeForNotificationAction", () => {
  it("opens the chat for message and assignment notifications", () => {
    expect(routeForNotificationAction("new_message", "/inbox?conversation=c-1")).toBe("/conversation/c-1");
    expect(routeForNotificationAction("conversation_assigned", "/inbox?conversation=c-2")).toBe("/conversation/c-2");
  });
  it("opens the contacts tab for lead closure reminders", () => {
    expect(routeForNotificationAction("closure_overdue", null)).toBe("/contacts");
  });
  it("ignores anything it can't map", () => {
    expect(routeForNotificationAction("new_message", null)).toBeNull();
    expect(routeForNotificationAction("new_message", "/inbox")).toBeNull();
    expect(routeForNotificationAction("other", "/inbox?conversation=c-1")).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  it("shows minutes, hours and days", () => {
    expect(relativeTime("2026-10-16T11:59:40Z", now)).toBe("now");
    expect(relativeTime("2026-10-16T11:54:00Z", now)).toBe("6m");
    expect(relativeTime("2026-10-16T09:00:00Z", now)).toBe("3h");
    expect(relativeTime("2026-10-14T12:00:00Z", now)).toBe("2d");
  });
});
