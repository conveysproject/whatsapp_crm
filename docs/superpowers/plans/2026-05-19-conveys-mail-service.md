# Conveys Mail Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, reusable mail service in `apps/conveys` and wire it to the contact form — sending a branded lead notification to `info@conveys.in` and a polished HTML auto-reply to the visitor.

**Architecture:** `lib/mail.ts` exports a generic `sendMail()` function (thin Resend wrapper) plus named template builder functions. The `/api/contact` route handler validates the body, applies an in-memory rate limit, then calls `sendMail` twice in parallel. The contact form becomes a controlled component with a service dropdown and loading/success/error UI states.

**Tech Stack:** Next.js 15 App Router route handlers, Resend SDK (`resend`), Vitest, TypeScript strict mode.

**Spec:** `docs/superpowers/specs/2026-05-19-conveys-mail-service-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/conveys/package.json` | Modify | Add `resend` dep; add `vitest` dev dep; add `test` script |
| `apps/conveys/vitest.config.ts` | Create | Vitest node-environment config |
| `apps/conveys/lib/rate-limit.ts` | Create | In-memory rate limiter — `checkRateLimit()` |
| `apps/conveys/lib/rate-limit.test.ts` | Create | Unit tests for rate limiter |
| `apps/conveys/lib/mail.ts` | Create | `sendMail()` + `buildLeadNotificationEmail()` + `buildAutoReplyEmail()` |
| `apps/conveys/lib/mail.test.ts` | Create | Unit tests for template builder pure functions |
| `apps/conveys/app/api/contact/route.ts` | Create | POST handler — validation, rate limit, send emails |
| `apps/conveys/app/api/contact/route.test.ts` | Create | Unit tests for route handler |
| `apps/conveys/components/conveys-home.tsx` | Modify | Controlled form: service dropdown, loading/success/error states |

---

## Task 1: Set Up Vitest

**Files:**
- Modify: `apps/conveys/package.json`
- Create: `apps/conveys/vitest.config.ts`

- [ ] **Step 1: Install vitest**

```bash
pnpm --filter @WBMSG/conveys add -D vitest
```

Expected: `+ vitest@<version>` with no errors. The root `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Add test script and update package.json**

Open `apps/conveys/package.json`. The `scripts` block currently looks like:

```json
"scripts": {
  "dev": "next dev --port 3001",
  "build": "next build",
  "start": "next start --port 3001",
  "lint": "next lint",
  "type-check": "tsc --noEmit",
  "clean": "rm -rf .next"
}
```

Replace with:

```json
"scripts": {
  "dev": "next dev --port 3001",
  "build": "next build",
  "start": "next start --port 3001",
  "lint": "next lint",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "clean": "rm -rf .next"
}
```

- [ ] **Step 3: Create vitest.config.ts**

Create `apps/conveys/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Verify vitest runs**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: exits 0 with `No test files found` or similar — no test files exist yet, that is correct.

- [ ] **Step 5: Commit**

```bash
git add apps/conveys/package.json apps/conveys/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(conveys): set up vitest"
```

---

## Task 2: Rate Limiter

**Files:**
- Create: `apps/conveys/lib/rate-limit.ts`
- Create: `apps/conveys/lib/rate-limit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/conveys/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetForTesting } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("allows the first request from an IP", () => {
    expect(checkRateLimit("1.2.3.4")).toBe(true);
  });

  it("allows up to 5 requests from the same IP within the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("1.2.3.4")).toBe(true);
    }
  });

  it("blocks the 6th request from the same IP", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("1.2.3.4")).toBe(false);
  });

  it("does not block a different IP", () => {
    for (let i = 0; i < 6; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("9.8.7.6")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `Error: Cannot find module './rate-limit'`

- [ ] **Step 3: Implement the rate limiter**

Create `apps/conveys/lib/rate-limit.ts`:

```ts
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

interface Entry {
  count: number;
  resetAt: number;
}

const map = new Map<string, Entry>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || entry.resetAt < now) {
    map.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count++;
  return true;
}

export function _resetForTesting(): void {
  map.clear();
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/conveys/lib/rate-limit.ts apps/conveys/lib/rate-limit.test.ts
git commit -m "feat(conveys): in-memory IP rate limiter"
```

---

## Task 3: Generic Mail Service with Branded HTML Templates

**Files:**
- Create: `apps/conveys/lib/mail.ts`
- Create: `apps/conveys/lib/mail.test.ts`

- [ ] **Step 1: Install resend**

```bash
pnpm --filter @WBMSG/conveys add resend
```

Expected: `+ resend@<version>` with no errors. Root `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write failing tests**

Create `apps/conveys/lib/mail.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLeadNotificationEmail, buildAutoReplyEmail } from "./mail";

const data = {
  name: "Riya Shah",
  email: "riya@example.com",
  phone: "+91 98765 43210",
  service: "AI Solutions",
  message: "I need an AI chatbot for my e-commerce site.",
};

describe("buildLeadNotificationEmail", () => {
  it("generates a subject containing name and service", () => {
    const { subject } = buildLeadNotificationEmail(data);
    expect(subject).toContain("Riya Shah");
    expect(subject).toContain("AI Solutions");
  });

  it("generates html containing all submitted fields", () => {
    const { html } = buildLeadNotificationEmail(data);
    expect(html).toContain("Riya Shah");
    expect(html).toContain("riya@example.com");
    expect(html).toContain("+91 98765 43210");
    expect(html).toContain("AI Solutions");
    expect(html).toContain("I need an AI chatbot");
  });

  it("omits the phone row when phone is not provided", () => {
    const { html } = buildLeadNotificationEmail({ ...data, phone: undefined });
    expect(html).not.toContain("+91 98765 43210");
  });
});

describe("buildAutoReplyEmail", () => {
  it("generates a subject containing the visitor name", () => {
    const { subject } = buildAutoReplyEmail({ name: "Riya Shah", service: "AI Solutions" });
    expect(subject).toContain("Riya Shah");
  });

  it("generates html mentioning the service they enquired about", () => {
    const { html } = buildAutoReplyEmail({ name: "Riya Shah", service: "AI Solutions" });
    expect(html).toContain("AI Solutions");
  });

  it("includes Conveys contact info in the html", () => {
    const { html } = buildAutoReplyEmail({ name: "Riya", service: "AI Solutions" });
    expect(html).toContain("info@conveys.in");
    expect(html).toContain("+91 99070 72035");
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `Error: Cannot find module './mail'`

- [ ] **Step 4: Implement the mail service**

Create `apps/conveys/lib/mail.ts`:

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Conveys <info@conveys.in>";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(options: MailOptions): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });
  if (error) throw new Error(error.message);
}

// ─── Template Builders ────────────────────────────────────────────────────────
// Pure functions — add new builders here for every new email flow.

export function buildLeadNotificationEmail(data: {
  name: string;
  email: string;
  phone?: string;
  service: string;
  message: string;
}): { subject: string; html: string } {
  const { name, email, phone, service, message } = data;
  const timestamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "long",
    timeStyle: "short",
  });

  return {
    subject: `New enquiry from ${name} — ${service}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 50%,#0284c7 100%);border-radius:16px 16px 0 0;padding:36px 44px 32px;">
              <span style="display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:100px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#bfdbfe;">New Enquiry</span>
              <h1 style="margin:12px 0 4px;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Contact Form Submission</h1>
              <p style="margin:0;font-size:14px;color:#bfdbfe;">Someone filled out the contact form on conveys.in</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px 44px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;width:120px;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Name</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <span style="font-size:15px;font-weight:600;color:#0f172a;">${name}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Email</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <a href="mailto:${email}" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none;">${email}</a>
                  </td>
                </tr>
                ${phone ? `<tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Phone</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <a href="tel:${phone}" style="font-size:15px;font-weight:600;color:#0f172a;text-decoration:none;">${phone}</a>
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Service</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
                    <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:100px;padding:4px 12px;font-size:13px;font-weight:700;">${service}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;background:#fafafa;vertical-align:top;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Message</span>
                  </td>
                  <td style="padding:16px 20px;vertical-align:top;">
                    <p style="margin:0;font-size:15px;color:#334155;line-height:1.6;white-space:pre-wrap;">${message}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td>
                    <a href="mailto:${email}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">Reply to ${name} →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:24px 44px;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">Received on ${timestamp} IST &nbsp;·&nbsp; <a href="https://conveys.in" style="color:#64748b;text-decoration:none;">conveys.in</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function buildAutoReplyEmail(data: {
  name: string;
  service: string;
}): { subject: string; html: string } {
  const { name, service } = data;
  return {
    subject: `We got your message, ${name} 👋`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>We got your message</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HERO HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#0284c7 100%);border-radius:16px 16px 0 0;padding:48px 44px 44px;text-align:center;">
              <p style="margin:0 0 20px;font-size:13px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#93c5fd;">CONVEYS</p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.3);border-radius:50%;width:64px;height:64px;text-align:center;vertical-align:middle;">
                    <span style="font-size:30px;color:#ffffff;line-height:1;">&#10003;</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">We got your message, ${name}!</h1>
              <p style="margin:0;font-size:16px;color:#bfdbfe;line-height:1.6;">Thanks for reaching out. We&apos;ve received your enquiry and we&apos;ll be in touch very soon.</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:44px;">

              <!-- SLA callout -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #bfdbfe;border-radius:12px;padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Our Promise</p>
                    <p style="margin:0;font-size:22px;font-weight:800;color:#1e3a8a;">We respond within 24 hours</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;color:#64748b;">Your enquiry about:</p>
              <p style="margin:0 0 28px;"><span style="display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:100px;padding:6px 16px;font-size:14px;font-weight:700;">${service}</span></p>

              <p style="margin:0 0 32px;font-size:15px;color:#475569;line-height:1.7;">While you wait, feel free to explore our work at <a href="https://conveys.in" style="color:#1d4ed8;text-decoration:none;font-weight:600;">conveys.in</a>. If you have anything to add or need to reach us urgently, just reply to this email or use the contact details below.</p>

              <!-- Contact info -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:32px;">
                <tr>
                  <td style="background:#f8fafc;padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">Email Us</p>
                    <a href="mailto:info@conveys.in" style="font-size:15px;font-weight:600;color:#1d4ed8;text-decoration:none;">info@conveys.in</a>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">Call Us</p>
                    <a href="tel:+919907072035" style="font-size:15px;font-weight:600;color:#0f172a;text-decoration:none;">+91 99070 72035</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:15px;color:#475569;">Talk soon,<br><strong style="color:#0f172a;">The Conveys Team</strong></p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:24px 44px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#334155;">Conveys Information Technology</p>
              <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">SwaminarayanCity, Dombivli West, Mumbai, Maharashtra 421202</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;"><a href="https://conveys.in" style="color:#64748b;text-decoration:none;">conveys.in</a> &nbsp;·&nbsp; We Build Digital Products That Move Businesses Forward</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `10 tests passed` (4 rate-limit + 6 mail)

- [ ] **Step 6: Commit**

```bash
git add apps/conveys/lib/mail.ts apps/conveys/lib/mail.test.ts apps/conveys/package.json pnpm-lock.yaml
git commit -m "feat(conveys): generic mail service — sendMail, lead notification and auto-reply templates"
```

---

## Task 4: Contact Route Handler

**Files:**
- Create: `apps/conveys/app/api/contact/route.ts`
- Create: `apps/conveys/app/api/contact/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/conveys/app/api/contact/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `Error: Cannot find module './route'`

- [ ] **Step 3: Implement the route handler**

Create `apps/conveys/app/api/contact/route.ts`:

```ts
import { checkRateLimit } from "../../../lib/rate-limit";
import {
  sendMail,
  buildLeadNotificationEmail,
  buildAutoReplyEmail,
} from "../../../lib/mail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  const ip =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many requests, please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, phone, service, message } = body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !service?.trim() || !message?.trim()) {
    return Response.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (message.length > 2000) {
    return Response.json(
      { error: "Message is too long (max 2000 characters)." },
      { status: 400 },
    );
  }

  const toEmail = process.env.CONTACT_TO_EMAIL ?? "info@conveys.in";

  try {
    await Promise.all([
      sendMail({
        to: toEmail,
        replyTo: email,
        ...buildLeadNotificationEmail({ name, email, phone, service, message }),
      }),
      sendMail({
        to: email,
        ...buildAutoReplyEmail({ name, service }),
      }),
    ]);
  } catch {
    return Response.json(
      { error: "Something went wrong, please try again." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `17 tests passed` (4 rate-limit + 6 mail + 7 route)

- [ ] **Step 5: Run type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/conveys/app/api/contact/route.ts apps/conveys/app/api/contact/route.test.ts
git commit -m "feat(conveys): POST /api/contact — validation, rate limit, dual email send"
```

---

## Task 5: Update Contact Form

**Files:**
- Modify: `apps/conveys/components/conveys-home.tsx`

This task is UI-only — the logic under test lives in the route handler (Task 4).

- [ ] **Step 1: Update imports at the top of the file**

The file currently begins:

```tsx
"use client";

import Link from "next/link";
import type { JSX } from "react";
```

Replace with:

```tsx
"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent, JSX } from "react";
import Link from "next/link";
```

- [ ] **Step 2: Add state and handlers inside ConveysHome**

The function currently opens as:

```tsx
export function ConveysHome(): JSX.Element {
  return (
```

Replace with:

```tsx
export function ConveysHome(): JSX.Element {
  const [form, setForm] = useState({ name: "", email: "", phone: "", service: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong, please try again.");
      } else {
        setStatus("success");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  return (
```

- [ ] **Step 3: Replace the form JSX**

Find this block (starts at the `<form` tag inside the Contact section, ends at `</form>`):

```tsx
            <form
              className="rounded-2xl bg-white p-8 shadow-xl"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <h3 className="text-lg font-bold text-slate-900">Send a Message</h3>
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="cf-name" className="sr-only">Name</label>
                  <input
                    id="cf-name"
                    name="name"
                    required
                    placeholder="Your name"
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="cf-email" className="sr-only">Email</label>
                  <input
                    id="cf-email"
                    name="email"
                    type="email"
                    required
                    placeholder="Email address"
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="cf-phone" className="sr-only">Phone</label>
                  <input
                    id="cf-phone"
                    name="phone"
                    type="tel"
                    placeholder="Phone number (optional)"
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="cf-msg" className="sr-only">Message</label>
                  <textarea
                    id="cf-msg"
                    name="message"
                    rows={4}
                    required
                    placeholder="Tell us about your project…"
                    className="w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-700 py-3.5 text-sm font-bold text-white shadow transition hover:bg-blue-800"
                >
                  Send Message
                </button>
              </div>
            </form>
```

Replace with:

```tsx
            <form
              className="rounded-2xl bg-white p-8 shadow-xl"
              onSubmit={handleSubmit}
            >
              <h3 className="text-lg font-bold text-slate-900">Send a Message</h3>

              {status === "success" ? (
                <div className="mt-6 flex flex-col items-center py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="mt-4 text-lg font-bold text-slate-900">Message sent!</h4>
                  <p className="mt-2 text-sm text-slate-500">We&apos;ll reply within 24 hours. Talk soon!</p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="cf-name" className="sr-only">Name</label>
                    <input
                      id="cf-name"
                      name="name"
                      required
                      placeholder="Your name"
                      value={form.name}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="cf-email" className="sr-only">Email</label>
                    <input
                      id="cf-email"
                      name="email"
                      type="email"
                      required
                      placeholder="Email address"
                      value={form.email}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="cf-phone" className="sr-only">Phone</label>
                    <input
                      id="cf-phone"
                      name="phone"
                      type="tel"
                      placeholder="Phone number (optional)"
                      value={form.phone}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="cf-service" className="sr-only">Service interested in</label>
                    <select
                      id="cf-service"
                      name="service"
                      required
                      value={form.service}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="" disabled>Service interested in…</option>
                      <option>Web &amp; App Development</option>
                      <option>Mobile App Development</option>
                      <option>WhatsApp CRM &amp; Business API</option>
                      <option>AI Solutions</option>
                      <option>Other / General Enquiry</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cf-msg" className="sr-only">Message</label>
                    <textarea
                      id="cf-msg"
                      name="message"
                      rows={4}
                      required
                      placeholder="Tell us about your project…"
                      value={form.message}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  {status === "error" && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {errorMsg}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full rounded-lg bg-blue-700 py-3.5 text-sm font-bold text-white shadow transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === "loading" ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending…
                      </span>
                    ) : "Send Message"}
                  </button>
                </div>
              )}
            </form>
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/conveys/components/conveys-home.tsx
git commit -m "feat(conveys): contact form — service dropdown, controlled state, loading/success/error UI"
```

---

## Task 6: Environment Variables and Manual Verification

**Files:**
- Create: `apps/conveys/.env.local` (local dev, not committed — already gitignored by Next.js)

- [ ] **Step 1: Create .env.local**

Create `apps/conveys/.env.local`:

```
RESEND_API_KEY=re_your_api_key_here
CONTACT_TO_EMAIL=info@conveys.in
```

Get your API key at resend.com → API Keys. Domain `conveys.in` must be verified in Resend dashboard before real sends work (add the DNS records Resend provides). Until verified, you can test with `to` set to your own verified email — Resend allows this in development.

- [ ] **Step 2: Start dev server**

```bash
pnpm --filter @WBMSG/conveys dev
```

Open `http://localhost:3001/#contact`.

- [ ] **Step 3: Test the form manually**

Fill out the form:
- Name: any name
- Email: an inbox you can check
- Phone: leave blank
- Service: AI Solutions
- Message: "Test from local dev"

Click **Send Message**. Verify:
1. Button shows spinner and fields go grey while submitting
2. Success card with green checkmark replaces the form after ~1-2 seconds
3. Lead notification email arrives at the `CONTACT_TO_EMAIL` address with the branded blue header and field rows
4. Auto-reply email arrives at the email you entered with the hero gradient header and 24h SLA callout

- [ ] **Step 4: Add Vercel env vars**

```bash
vercel env add RESEND_API_KEY
# paste the key, select Production + Preview + Development
```

- [ ] **Step 5: Run full test suite one final time**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: `17 tests passed, 0 failed`

- [ ] **Step 6: Run type-check one final time**

```bash
pnpm --filter @WBMSG/conveys type-check
```

Expected: no errors.
