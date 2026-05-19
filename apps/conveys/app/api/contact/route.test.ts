import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { sendMail } from "../../../lib/mail";
import { checkRateLimit } from "../../../lib/rate-limit";

vi.mock("../../../lib/mail", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  buildLeadNotificationEmail: vi.fn().mockReturnValue({ subject: "test subject", html: "<p>test</p>" }),
  buildAutoReplyEmail: vi.fn().mockReturnValue({ subject: "test reply", html: "<p>reply</p>" }),
}));

vi.mock("../../../lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue(true),
}));

function makeRequest(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Riya Shah",
  email: "riya@example.com",
  service: "AI Solutions",
  message: "Hello from the test.",
};

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue(true);
    vi.mocked(sendMail).mockResolvedValue(undefined);
  });

  it("returns 200 with ok:true on a valid submission", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("calls sendMail exactly twice — notification + auto-reply", async () => {
    await POST(makeRequest(validBody));
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ name: "Riya" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message exceeds 2000 characters", async () => {
    const res = await POST(makeRequest({ ...validBody, message: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when the rate limit is exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue(false);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
  });

  it("returns 500 when sendMail throws", async () => {
    vi.mocked(sendMail).mockRejectedValue(new Error("Resend API error"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
