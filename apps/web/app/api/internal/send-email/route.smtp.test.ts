import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendMail = vi.fn();
const sendViaSmtp = vi.fn();
vi.mock("../../../../lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock("../../../../lib/smtp-send", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/smtp-send")>("../../../../lib/smtp-send");
  return { ...actual, sendViaSmtp: (...a: unknown[]) => sendViaSmtp(...a) };
});

import { POST, maxDuration } from "./route";

const SECRET = "s".repeat(40);
const PASS = "test-pass-123";
const smtp = {
  host: "smtp.example.com",
  port: 587,
  security: "starttls",
  user: "mailer@example.com",
  pass: PASS,
  fromAddress: "noreply@example.com",
};
const post = (body: Record<string, unknown>, token = SECRET) =>
  POST(
    new NextRequest("http://localhost/api/internal/send-email", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ to: "a@b.co", subject: "hi", html: "<p>x</p>", ...body }),
    }),
  );

let spies: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  sendMail.mockReset().mockResolvedValue(undefined);
  sendViaSmtp.mockReset().mockResolvedValue({ ok: true });
  vi.stubEnv("INTERNAL_EMAIL_SECRET", SECRET);
  spies = (["log", "info", "warn", "error"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
});
afterEach(() => {
  vi.unstubAllEnvs();
  spies.forEach((s) => s.mockRestore());
});

describe("send-email relay: smtp mode", () => {
  it("exports a maxDuration that outlasts the SMTP timeouts", () => {
    expect(maxDuration).toBe(30);
  });
  it("sends through SMTP, not the default mailbox", async () => {
    const res = await post({ smtp, fromName: "Acme", replyTo: "h@acme.test" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendViaSmtp).toHaveBeenCalledWith(
      smtp,
      { to: "a@b.co", subject: "hi", html: "<p>x</p>", replyTo: "h@acme.test", fromName: "Acme" },
    );
  });
  it("requires the bearer secret", async () => {
    expect((await post({ smtp }, "wrong")).status).toBe(401);
    expect((await post({ smtp }, "")).status).toBe(401);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
  it("without smtp behaves as before", async () => {
    expect((await post({})).status).toBe(200);
    expect(sendMail).toHaveBeenCalledWith({ to: "a@b.co", subject: "hi", html: "<p>x</p>" });
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
  it.each([
    ["port", { port: 22 }], ["security", { security: "none" }], ["user", { user: "" }], ["pass", { pass: "" }],
    ["fromAddress", { fromAddress: "Name <a@b.co>" }], ["host type", { host: 5 }], ["plain without allowPlain", { security: "plain" }],
    ["extra smtp field", { proxy: "http://x" }],
  ])("rejects invalid smtp %s with 400", async (_n, over) => {
    const res = await post({ smtp: { ...smtp, ...over } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain(PASS);
    expect(sendViaSmtp).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it.each([[null], ["x"], [[]], [42]])("rejects non-object smtp %j", async (v) => {
    expect((await post({ smtp: v })).status).toBe(400);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
  it("rejects unknown top-level fields in smtp mode", async () => {
    expect((await post({ smtp, bcc: "x@y.zz" })).status).toBe(400);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
  it.each([[["a@b.co", "c@d.ef"]], ["a@b.co, c@d.ef"], ["N <a@b.co>"]])("rejects to %j in smtp mode", async (to) => {
    expect((await post({ smtp, to })).status).toBe(400);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
  it("keeps the html size cap and fromName check", async () => {
    expect((await post({ smtp, html: "x".repeat(70 * 1024) })).status).toBe(400);
    expect((await post({ smtp, fromName: "" })).status).toBe(400);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
  it("answers 502 with only the fixed result shape", async () => {
    sendViaSmtp.mockResolvedValueOnce({ ok: false, retryable: true, reason: "connection failed" });
    const res = await post({ smtp });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, retryable: true, reason: "connection failed" });
  });
  it("never leaks a thrown error, the password or the host in the response or logs", async () => {
    sendViaSmtp.mockRejectedValueOnce(new Error(`boom ${PASS} smtp.example.com`));
    const res = await post({ smtp });
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/test-pass|smtp\.example|boom/);
    expect(JSON.parse(text)).toEqual({ ok: false, retryable: true, reason: "send failed" });
    const logs = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join("\n");
    expect(logs).not.toMatch(/test-pass|smtp\.example|boom/);
  });
});
