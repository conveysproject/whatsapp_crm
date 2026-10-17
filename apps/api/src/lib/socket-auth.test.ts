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
    await expect(authenticateSocket(prisma, "tok", verify)).resolves.toEqual({ userId: "u-1", organizationId: "org-1", sid: null });
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

describe("authenticateSocket sid", () => {
  it("returns the session id from the verifier", async () => {
    const verify = vi.fn().mockResolvedValue({ userId: "u-1", sid: "s-1" });
    const r = await authenticateSocket(prismaWith({ organizationId: "org-1" }), "tok", verify);
    expect(r.sid).toBe("s-1");
  });

  it("rejects a handshake whose session is already revoked (real verifyBearer)", async () => {
    vi.resetModules();
    vi.doMock("../auth/tokens.js", () => ({ verifyAccessToken: vi.fn(async () => ({ sub: "u-1", sid: "s-1", typ: "user" })) }));
    vi.doMock("../auth/sessions.js", () => ({ isSessionRevoked: vi.fn(async () => true) }));
    vi.doMock("../lib/clerk.js", () => ({ verifyClerkToken: vi.fn() }));
    const prev = process.env.AUTH_PROVIDER;
    process.env.AUTH_PROVIDER = "wbmsg";
    try {
      const mod = await import("./socket-auth.js");
      await expect(mod.authenticateSocket(prismaWith({ organizationId: "org-1" }), "tok")).rejects.toThrow("unauthorized");
    } finally {
      if (prev === undefined) delete process.env.AUTH_PROVIDER;
      else process.env.AUTH_PROVIDER = prev;
      vi.doUnmock("../auth/tokens.js");
      vi.doUnmock("../auth/sessions.js");
      vi.doUnmock("../lib/clerk.js");
    }
  });
});

describe("canJoinRoom", () => {
  const me = { userId: "u-1", organizationId: "org-1", sid: null };
  it("allows only the caller's own org and user rooms", () => {
    expect(canJoinRoom(me, "org", "org-1")).toBe(true);
    expect(canJoinRoom(me, "user", "u-1")).toBe(true);
    expect(canJoinRoom(me, "org", "org-2")).toBe(false);
    expect(canJoinRoom(me, "user", "u-2")).toBe(false);
    expect(canJoinRoom(me, "org", { id: "org-1" })).toBe(false);
  });
});
