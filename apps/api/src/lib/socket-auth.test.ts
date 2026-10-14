import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { authenticateSocket, canJoinRoom } from "./socket-auth.js";

function prismaWith(user: { organizationId: string } | null) {
  return { user: { findFirst: vi.fn().mockResolvedValue(user) } } as unknown as PrismaClient;
}

describe("authenticateSocket", () => {
  it("returns the user's own org for a valid token", async () => {
    const verify = vi.fn().mockResolvedValue({ userId: "u-1" });
    const prisma = prismaWith({ organizationId: "org-1" });
    await expect(authenticateSocket(prisma, "tok", verify)).resolves.toEqual({ userId: "u-1", organizationId: "org-1" });
    expect(verify).toHaveBeenCalledWith("Bearer tok");
    expect((prisma.user.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({ id: "u-1", isActive: true, deletedAt: null });
  });

  it("rejects a missing or non-string token without calling Clerk", async () => {
    const verify = vi.fn();
    await expect(authenticateSocket(prismaWith(null), undefined, verify)).rejects.toThrow("unauthorized");
    await expect(authenticateSocket(prismaWith(null), 42, verify)).rejects.toThrow("unauthorized");
    await expect(authenticateSocket(prismaWith(null), "", verify)).rejects.toThrow("unauthorized");
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects when Clerk rejects the token", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("expired"));
    await expect(authenticateSocket(prismaWith({ organizationId: "org-1" }), "tok", verify)).rejects.toThrow("unauthorized");
  });

  it("rejects an unknown or inactive user", async () => {
    const verify = vi.fn().mockResolvedValue({ userId: "u-9" });
    await expect(authenticateSocket(prismaWith(null), "tok", verify)).rejects.toThrow("unauthorized");
  });
});

describe("canJoinRoom", () => {
  const me = { userId: "u-1", organizationId: "org-1" };
  it("allows only the caller's own org and user rooms", () => {
    expect(canJoinRoom(me, "org", "org-1")).toBe(true);
    expect(canJoinRoom(me, "user", "u-1")).toBe(true);
    expect(canJoinRoom(me, "org", "org-2")).toBe(false);
    expect(canJoinRoom(me, "user", "u-2")).toBe(false);
    expect(canJoinRoom(me, "org", { id: "org-1" })).toBe(false);
  });
});
