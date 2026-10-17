import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  isLocked: vi.fn(),
  issueCode: vi.fn(),
  sendCodeEmail: vi.fn(),
}));
vi.mock("../limits.js", () => ({ hitLimit: m.hitLimit, isLocked: m.isLocked, authClientIp: () => "9.9.9.9" }));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: vi.fn() }));
vi.mock("../emails.js", () => ({ sendCodeEmail: m.sendCodeEmail, sendPasswordChangedEmail: vi.fn() }));
vi.mock("../sessions.js", () => ({ createSession: vi.fn(), revokeAllSessions: vi.fn() }));
vi.mock("../pending-signup.js", () => ({
  savePendingSignup: vi.fn().mockResolvedValue("created"),
  loadPendingSignup: vi.fn(),
  deletePendingSignup: vi.fn(),
}));
vi.mock("../devices.js", () => ({ trustDevice: vi.fn(), isTrustedDevice: vi.fn() }));

import { authRouter } from "./index.js";
import { settleSignupWork } from "./signup.js";

process.env.AUTH_PROVIDER = "wbmsg";

const prisma = {
  authAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
};
const fetchMock = vi.fn();

const cases = [
  { url: "/v1/auth/signup", body: { email: "a@x.com", password: "correct horse", firstName: "A", lastName: "B", business: { companyName: "Co", industry: "Retail", revenue: "1M" } } },
  { url: "/v1/auth/signin/code/request", body: { email: "a@x.com" } },
  { url: "/v1/auth/password/forgot", body: { email: "a@x.com" } },
];

describe("turnstile on request routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TURNSTILE_SECRET_KEY = "secret";
    m.hitLimit.mockResolvedValue(false);
    m.isLocked.mockResolvedValue(false);
    m.issueCode.mockResolvedValue({ code: "123456", codeId: "c1" });
    prisma.authAccount.findUnique.mockResolvedValue(null);
    prisma.authAccount.create.mockImplementation(async ({ data }: any) => data);
    app = Fastify({ logger: false });
    app.decorate("prisma", prisma as any);
    await app.register(authRouter, { prefix: "/v1/auth" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  for (const c of cases) {
    describe(c.url, () => {
      it("missing token -> 400 BOT_CHECK_FAILED, no db, no mail, no fetch", async () => {
        const res = await app.inject({ method: "POST", url: c.url, payload: c.body });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({
          error: { code: "BOT_CHECK_FAILED", message: "Please complete the check and try again." },
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(prisma.authAccount.findUnique).not.toHaveBeenCalled();
        expect(prisma.authAccount.create).not.toHaveBeenCalled();
        expect(m.sendCodeEmail).not.toHaveBeenCalled();
      });

      it("failed verification -> 400, no db, no mail", async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
        const res = await app.inject({ method: "POST", url: c.url, payload: { ...c.body, turnstileToken: "bad" } });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe("BOT_CHECK_FAILED");
        expect(prisma.authAccount.findUnique).not.toHaveBeenCalled();
        expect(m.sendCodeEmail).not.toHaveBeenCalled();
      });

      it("success -> 202 and the work runs", async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
        const res = await app.inject({ method: "POST", url: c.url, payload: { ...c.body, turnstileToken: "good" } });
        await settleSignupWork();
        expect(res.statusCode).toBe(202);
        expect(res.json()).toMatchObject({ ok: true });
        expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get("remoteip")).toBe("9.9.9.9");
      });
    });
  }
});
