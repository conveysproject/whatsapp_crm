import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("../lib/redis.js", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }),
  },
}));
vi.mock("./tokens.js", () => ({
  signAccessToken: vi.fn(async (c: { sid: string }) => `access-${c.sid}`),
}));

import {
  createSession,
  isSessionRevoked,
  revokeAllSessions,
  revokeSession,
  rotateRefreshToken,
} from "./sessions.js";
import { redis } from "../lib/redis.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DAY = 86_400_000;

type Row = Record<string, any>;
function makePrisma(row?: Row) {
  const session = {
    create: vi.fn(async ({ data }: any) => data),
    findUnique: vi.fn(async ({ where }: any) =>
      row && row.refreshTokenHash === where.refreshTokenHash ? row : null,
    ),
    findFirst: vi.fn(async ({ where }: any) =>
      row && row.previousTokenHash === where.previousTokenHash ? row : null,
    ),
    findMany: vi.fn(async (..._a: any[]) => (row ? [{ id: row.id }] : [])),
    updateMany: vi.fn(async (..._a: any[]) => ({ count: 1 })),
    update: vi.fn(),
  };
  const prisma: any = { authSession: session, $transaction: vi.fn(async (fn: any) => fn(prisma)) };
  return { prisma, session };
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("createSession", () => {
  it("returns tokens and stores only the hash", async () => {
    const { prisma, session } = makePrisma();
    const r = await createSession(prisma, { accountId: "a1", client: "web", typ: "user" });
    const data = session.create.mock.calls[0][0].data;
    expect(data.refreshTokenHash).toBe(sha(r.refreshToken));
    expect(data.refreshTokenHash).not.toBe(r.refreshToken);
    expect(JSON.stringify(data)).not.toContain(r.refreshToken);
    expect(data.id).toBe(r.sessionId);
    expect(data.familyId).toBeTruthy();
    expect(r.accessToken).toBe(`access-${r.sessionId}`);
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });
  it("admin sessions expire in 12 h", async () => {
    const { prisma } = makePrisma();
    const r = await createSession(prisma, { accountId: "a1", client: "admin", typ: "admin" });
    expect(r.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 12 * 3600_000);
    expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
  });
});

describe("rotateRefreshToken", () => {
  const base = (over: Row = {}): Row => ({
    id: "s1",
    accountId: "a1",
    client: "web",
    familyId: "f1",
    refreshTokenHash: sha("old"),
    previousTokenHash: null,
    rotatedAt: null,
    expiresAt: new Date(Date.now() + DAY),
    createdAt: new Date(),
    revokedAt: null,
    ...over,
  });

  it("rotates: new token, old hash becomes previous, conditional update, lastUsedAt", async () => {
    const { prisma, session } = makePrisma(base());
    const r: any = await rotateRefreshToken(prisma, "old");
    expect(r.refreshToken).toBeTruthy();
    expect(r.refreshToken).not.toBe("old");
    expect(r.sessionId).toBe("s1");
    const arg = session.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "s1", refreshTokenHash: sha("old") });
    expect(arg.data.refreshTokenHash).toBe(sha(r.refreshToken));
    expect(arg.data.previousTokenHash).toBe(sha("old"));
    expect(arg.data.lastUsedAt).toBeInstanceOf(Date);
    expect(arg.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it("two rotations with the same token within 10 s return the same new token", async () => {
    const row = base();
    const { prisma, session } = makePrisma(row);
    const first: any = await rotateRefreshToken(prisma, "old");
    // simulate DB state after first rotation
    Object.assign(row, {
      refreshTokenHash: sha(first.refreshToken),
      previousTokenHash: sha("old"),
      rotatedAt: new Date(),
    });
    const second: any = await rotateRefreshToken(prisma, "old");
    expect(second.refreshToken).toBe(first.refreshToken);
    expect(session.updateMany).toHaveBeenCalledTimes(1);
  });

  it("same token after 11 s is reuse and revokes the family", async () => {
    vi.useFakeTimers();
    const row = base();
    const { prisma, session } = makePrisma(row);
    const first: any = await rotateRefreshToken(prisma, "old");
    Object.assign(row, {
      refreshTokenHash: sha(first.refreshToken),
      previousTokenHash: sha("old"),
      rotatedAt: new Date(),
    });
    vi.advanceTimersByTime(11_000);
    session.updateMany.mockClear();
    const r = await rotateRefreshToken(prisma, "old");
    expect(r).toEqual({ error: "reused" });
    const arg = session.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ familyId: "f1" });
    expect(arg.data.revokedReason).toBe("reuse_detected");
    expect(store.get("auth:revoked:s1")).toBeTruthy();
  });

  it("unknown token is invalid", async () => {
    const { prisma } = makePrisma(base());
    expect(await rotateRefreshToken(prisma, "nope")).toEqual({ error: "invalid" });
  });

  it("revoked session is invalid", async () => {
    const { prisma } = makePrisma(base({ revokedAt: new Date() }));
    expect(await rotateRefreshToken(prisma, "old")).toEqual({ error: "invalid" });
  });

  it("expired session is expired", async () => {
    const { prisma } = makePrisma(base({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await rotateRefreshToken(prisma, "old")).toEqual({ error: "expired" });
  });

  it("admin session is not extended by rotation", async () => {
    const { prisma, session } = makePrisma(base({ client: "admin" }));
    const r: any = await rotateRefreshToken(prisma, "old");
    expect(r.refreshToken).toBeTruthy();
    expect(session.updateMany.mock.calls[0][0].data).not.toHaveProperty("expiresAt");
  });

  it("lost race (count 0) returns the winner's pair via grace key", async () => {
    const row = base();
    const { prisma, session } = makePrisma(row);
    session.updateMany.mockResolvedValueOnce({ count: 0 });
    store.set(
      `auth:grace:${sha("old")}`,
      JSON.stringify({ refreshToken: "winner", sessionId: "s1" }),
    );
    const r: any = await rotateRefreshToken(prisma, "old");
    expect(r.refreshToken).toBe("winner");
  });
});

describe("revocation", () => {
  it("revokeSession updates the row and sets the Redis key with 600 s TTL", async () => {
    const { prisma, session } = makePrisma();
    await revokeSession(prisma, "s1", "logout");
    expect(session.updateMany.mock.calls[0][0].data.revokedReason).toBe("logout");
    expect(redis.set).toHaveBeenCalledWith("auth:revoked:s1", "1", "EX", 600);
    expect(await isSessionRevoked("s1")).toBe(true);
    expect(await isSessionRevoked("s2")).toBe(false);
  });

  it("revokeAllSessions excludes a session and returns the count", async () => {
    const { prisma, session } = makePrisma();
    session.findMany.mockResolvedValueOnce([{ id: "s1" }, { id: "s2" }]);
    session.updateMany.mockResolvedValueOnce({ count: 2 });
    const n = await revokeAllSessions(prisma, "a1", "password_change", "s3");
    expect(n).toBe(2);
    expect(session.findMany.mock.calls[0][0].where).toMatchObject({
      accountId: "a1",
      revokedAt: null,
      id: { not: "s3" },
    });
    expect(store.has("auth:revoked:s1")).toBe(true);
    expect(store.has("auth:revoked:s2")).toBe(true);
  });
});
