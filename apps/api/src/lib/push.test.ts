import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("expo-server-sdk", () => {
  class Expo {
    static isExpoPushToken(t: unknown): boolean { return typeof t === "string" && t.startsWith("ExponentPushToken["); }
    chunkPushNotifications<T>(m: T[]): T[][] { return [m]; }
    sendPushNotificationsAsync = mockSend;
  }
  return { default: Expo };
});

const mockPrisma = {
  userDevice: { findMany: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  conversation: { count: vi.fn() },
};
const prisma = mockPrisma as unknown as PrismaClient;
const A = "ExponentPushToken[aaa]";
const B = "ExponentPushToken[bbb]";

beforeEach(() => { vi.clearAllMocks(); });

describe("sendPushToUser", () => {
  it("sends once per distinct valid token (devices + legacy pushToken) and truncates the body", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }, { deviceToken: "not-expo" }, { deviceToken: null }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: A });
    mockSend.mockResolvedValue([{ status: "ok" }]);
    const { sendPushToUser } = await import("./push.js");
    const n = await sendPushToUser(prisma, "u-1", { title: "Priya", body: "x".repeat(150), data: { type: "new_message", conversationId: "c-1" }, badge: 2 });
    expect(n).toBe(1);
    const msgs = mockSend.mock.calls[0][0];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ to: A, title: "Priya", sound: "default", badge: 2, data: { type: "new_message", conversationId: "c-1" } });
    expect(msgs[0].body).toHaveLength(100);
  });

  it("does nothing when the user has no valid token", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: null });
    const { sendPushToUser } = await import("./push.js");
    expect(await sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} })).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("removes tokens Expo reports as DeviceNotRegistered", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: B });
    mockSend.mockResolvedValue([
      { status: "ok" },
      { status: "error", details: { error: "DeviceNotRegistered" } },
    ]);
    const { sendPushToUser } = await import("./push.js");
    await sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} });
    expect(mockPrisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1", deviceToken: { in: [B] } } });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { pushToken: null } });
  });

  it("never throws when Expo or the database fails", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: null });
    mockSend.mockRejectedValue(new Error("expo down"));
    const { sendPushToUser } = await import("./push.js");
    await expect(sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} })).resolves.toBe(0);
    mockPrisma.userDevice.findMany.mockRejectedValue(new Error("db down"));
    await expect(sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} })).resolves.toBe(0);
  });
});

describe("pushToUser", () => {
  it("sets the badge to the user's unread assigned chat count", async () => {
    mockPrisma.conversation.count.mockResolvedValue(3);
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: null });
    mockSend.mockResolvedValue([{ status: "ok" }]);
    const { pushToUser } = await import("./push.js");
    await pushToUser(prisma, "org-1", "u-1", { title: "t", body: "b", data: { type: "new_message" } });
    expect(mockPrisma.conversation.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1", assignedTo: "u-1", status: { in: ["open", "pending"] }, unreadCount: { gt: 0 } },
    });
    expect(mockSend.mock.calls[0][0][0].badge).toBe(3);
  });
});
