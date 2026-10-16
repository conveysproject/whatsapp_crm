import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { issueCode, verifyCode, verifyCodeById } from "./codes.js";

type Row = {
  id: string;
  accountId: string | null;
  purpose: string;
  target: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

function fakePrisma() {
  const rows: Row[] = [];
  let n = 0;
  const match = (r: Row, w: any) =>
    (w.id === undefined || r.id === w.id) &&
    (w.purpose === undefined || r.purpose === w.purpose) &&
    (w.target === undefined || r.target === w.target) &&
    (w.consumedAt === undefined || (w.consumedAt === null ? r.consumedAt === null : true)) &&
    (w.attempts?.lt === undefined || r.attempts < w.attempts.lt) &&
    (w.createdAt?.gte === undefined || r.createdAt >= w.createdAt.gte);
  const authCode = {
    count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
    create: async ({ data }: any) => {
      const row: Row = { id: `c${++n}`, accountId: null, attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
      rows.push(row);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => match(r, where));
      for (const r of hit) {
        if (data.consumedAt) r.consumedAt = data.consumedAt;
        if (data.attempts?.increment) r.attempts += data.attempts.increment;
      }
      return { count: hit.length };
    },
    findFirst: async ({ where }: any) =>
      rows.filter((r) => match(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
  };
  return { prisma: { authCode } as any, rows };
}

const T = "a@b.com";

describe("one-time codes", () => {
  beforeEach(() => {
    process.env["AUTH_CODE_PEPPER"] = "p".repeat(40);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues a 6-digit code and stores only an HMAC", async () => {
    const { prisma, rows } = fakePrisma();
    const r: any = await issueCode(prisma, { purpose: "signin_email", target: T });
    expect(r.code).toMatch(/^\d{6}$/);
    expect(rows[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]!.codeHash).not.toContain(r.code);
    expect(Object.values(rows[0]!)).not.toContain(r.code);
  });

  it("correct code is ok once, second use is invalid", async () => {
    const { prisma } = fakePrisma();
    const r: any = await issueCode(prisma, { purpose: "signin_email", target: T, accountId: "acc1" });
    const input = { purpose: "signin_email" as const, target: T, code: r.code };
    expect(await verifyCode(prisma, input)).toEqual({ ok: true, accountId: "acc1", target: T });
    expect(await verifyCode(prisma, input)).toEqual({ ok: false, reason: "invalid" });
  });

  it("a password_reset code used as signin_email is invalid", async () => {
    const { prisma } = fakePrisma();
    const r: any = await issueCode(prisma, { purpose: "password_reset", target: T });
    expect(await verifyCode(prisma, { purpose: "signin_email", target: T, code: r.code })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("wrong code is invalid", async () => {
    const { prisma } = fakePrisma();
    const r: any = await issueCode(prisma, { purpose: "signin_email", target: T });
    const wrong = r.code === "000000" ? "000001" : "000000";
    expect(await verifyCode(prisma, { purpose: "signin_email", target: T, code: wrong })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("expires after 600 s", async () => {
    vi.useFakeTimers();
    const { prisma } = fakePrisma();
    const r: any = await issueCode(prisma, { purpose: "signin_email", target: T });
    vi.advanceTimersByTime(601_000);
    expect(await verifyCode(prisma, { purpose: "signin_email", target: T, code: r.code })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("6th attempt is too_many_attempts even with the right code", async () => {
    const { prisma } = fakePrisma();
    const r: any = await issueCode(prisma, { purpose: "signin_email", target: T });
    const wrong = r.code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await verifyCode(prisma, { purpose: "signin_email", target: T, code: wrong });
    }
    expect(await verifyCode(prisma, { purpose: "signin_email", target: T, code: r.code })).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("4th issue within 10 minutes is throttled", async () => {
    const { prisma } = fakePrisma();
    for (let i = 0; i < 3; i++) {
      expect("error" in (await issueCode(prisma, { purpose: "signin_email", target: T }))).toBe(false);
    }
    expect(await issueCode(prisma, { purpose: "signin_email", target: T })).toEqual({ error: "throttled" });
    expect("error" in (await issueCode(prisma, { purpose: "signin_email", target: "c@d.com" }))).toBe(false);
  });

  it("a new issue invalidates the old code", async () => {
    const { prisma, rows } = fakePrisma();
    await issueCode(prisma, { purpose: "signin_email", target: T });
    await issueCode(prisma, { purpose: "signin_email", target: T });
    expect(rows[0]!.consumedAt).not.toBeNull();
    expect(rows[1]!.consumedAt).toBeNull();
  });

  it("throws a config error when the pepper is missing or short", async () => {
    const { prisma } = fakePrisma();
    process.env["AUTH_CODE_PEPPER"] = "short";
    await expect(issueCode(prisma, { purpose: "signin_email", target: T })).rejects.toThrow(/AUTH_CODE_PEPPER/);
    delete process.env["AUTH_CODE_PEPPER"];
    await expect(issueCode(prisma, { purpose: "signin_email", target: T })).rejects.toThrow(/AUTH_CODE_PEPPER/);
  });

  describe("verifyCodeById", () => {
    it("correct id+purpose+code is ok, returns target, single use", async () => {
      const { prisma } = fakePrisma();
      const r: any = await issueCode(prisma, { purpose: "password_reset", target: T, accountId: "acc1" });
      const input = { codeId: r.codeId, purpose: "password_reset" as const, code: r.code };
      expect(await verifyCodeById(prisma, input)).toEqual({ ok: true, accountId: "acc1", target: T });
      expect(await verifyCodeById(prisma, input)).toEqual({ ok: false, reason: "invalid" });
    });

    it("wrong purpose for the id is invalid", async () => {
      const { prisma } = fakePrisma();
      const r: any = await issueCode(prisma, { purpose: "password_reset", target: T });
      expect(await verifyCodeById(prisma, { codeId: r.codeId, purpose: "signin_email", code: r.code })).toEqual({
        ok: false,
        reason: "invalid",
      });
    });

    it("unknown id is invalid", async () => {
      const { prisma } = fakePrisma();
      expect(await verifyCodeById(prisma, { codeId: "nope", purpose: "signin_email", code: "123456" })).toEqual({
        ok: false,
        reason: "invalid",
      });
    });
  });
});
