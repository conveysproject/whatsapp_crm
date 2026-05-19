# Conveys Mail Service — Design Spec

**Date:** 2026-05-19  
**Status:** Approved  
**Scope:** `apps/conveys` only — self-contained, no cross-service dependencies

---

## 1. Goal

Wire up the Conveys marketing site contact form so that submissions:
1. Send a **lead notification** email to `info@conveys.in`
2. Send a **branded auto-reply** to the visitor confirming receipt

Both emails use polished HTML design aligned with the Conveys brand (blue palette, clean layout).

---

## 2. Architecture & Data Flow

```
Visitor fills form → onSubmit → fetch POST /api/contact (JSON)
                                        │
                        apps/conveys/app/api/contact/route.ts
                          1. Server-side field validation
                          2. Rate limit (5 req / IP / 10 min, in-memory)
                          3. Resend.sendEmail × 2 (parallel)
                               a. Lead notification → info@conveys.in
                               b. Auto-reply       → visitor email
                          4. Return 200 { ok: true } | 429 | 500
                                        │
                        Form shows success card or inline error banner
```

---

## 3. Files Changed

| File | Change |
|---|---|
| `apps/conveys/package.json` | Add `resend` dependency |
| `apps/conveys/lib/mail.ts` | Resend client + two HTML email template functions |
| `apps/conveys/app/api/contact/route.ts` | POST handler — validation, rate limit, send emails |
| `apps/conveys/components/conveys-home.tsx` | Controlled form — service dropdown, loading/success/error states |
| Vercel env vars | `RESEND_API_KEY`, `CONTACT_TO_EMAIL` (default `info@conveys.in`) |

---

## 4. Form Fields

| Field | Type | Required |
|---|---|---|
| Name | text | Yes |
| Email | email | Yes |
| Phone | tel | No |
| Service | select | Yes |
| Message | textarea | Yes |

**Service dropdown options:**
- Web & App Development
- Mobile App Development
- WhatsApp CRM & Business API
- AI Solutions
- Other / General Enquiry

---

## 5. Email Specs

### 5a. Lead Notification (to `info@conveys.in`)

- **From:** `Conveys <info@conveys.in>`
- **Subject:** `New enquiry from {name} — {service}`
- **Design:** Branded HTML — Conveys blue header, structured data rows (name, email, phone, service, message), IST timestamp footer
- **Reply-To:** visitor's email address (so replying opens a thread directly with the lead)

### 5b. Auto-Reply (to visitor)

- **From:** `Conveys <info@conveys.in>`
- **Subject:** `We got your message, {name} 👋`
- **Design:** Wow-quality HTML — hero gradient header, confirmation message, 24-hour SLA callout, contact info block (`info@conveys.in`, `+91 99070 72035`), footer with brand tagline
- **Content:** Warm, brief — confirms receipt, sets expectation, provides fallback contact details

---

## 6. Route Handler Logic (`/api/contact`)

```
POST /api/contact
Body: { name, email, phone?, service, message }

1. Validate:
   - name, email, service, message required
   - email must be valid format
   - message max 2000 chars

2. Rate limit:
   - Key: client IP (x-forwarded-for header)
   - Limit: 5 requests per 10 minutes
   - On exceed: return 429 { error: "Too many requests, try again later" }

3. Send emails (Promise.all):
   - Lead notification
   - Auto-reply

4. On Resend error: return 500 { error: "Something went wrong, please try again" }
5. On success: return 200 { ok: true }
```

---

## 7. Form UX States

| State | UI |
|---|---|
| **Idle** | All fields enabled, "Send Message" button |
| **Loading** | Fields disabled, button shows spinner + "Sending…", no double-submit |
| **Success** | Form replaced by green checkmark card: "Message sent! We'll reply within 24 hours." |
| **Error** | Red inline banner below button with error message |

---

## 8. Environment Variables

| Variable | Description | Default |
|---|---|---|
| `RESEND_API_KEY` | Resend API key (required) | — |
| `CONTACT_TO_EMAIL` | Notification recipient | `info@conveys.in` |

Set in Vercel project settings for the `conveys` deployment. Locally, add to `apps/conveys/.env.local`.

---

## 9. Rate Limiting Notes

In-memory `Map` keyed by IP. Works correctly on Vercel serverless (each cold start gets a fresh map; the window is short enough that this is acceptable for a low-traffic marketing site). No Redis dependency needed.

---

## 10. Out of Scope

- Saving submissions to a database (no persistence layer in Conveys)
- reCAPTCHA / hCaptcha (rate limiting is sufficient for now)
- Email open/click tracking
- Admin dashboard for leads
