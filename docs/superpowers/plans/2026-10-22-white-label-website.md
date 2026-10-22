# White-label website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent company's brand (name, logo, favicon, color, support email) replaces "WBMSG" in the web app, invitation pages, a branded sign-in path and emails, for the parent and all its linked clients, once a super admin approves it. Part B lets the parent connect its own email service (SMTP and the main API providers) so those emails go out from its own address.

**Architecture:** One brand object resolved server-side (own brand if parent with white-label on, else the parent's, else the WBMSG default). The dashboard layout fetches it once and hands it to a `BrandProvider`; Tailwind's `brand-*` scale becomes CSS variables with today's green as the default so nothing changes when no brand is set. Emails take a brand and a from-name; the sender address stays our verified mailbox. No domain, DNS or host routing.

**Tech Stack:** Fastify + Prisma + R2 (apps/api), Next.js App Router + Tailwind + React Query (apps/web), Vitest. Hand-authored SQL migrations (local DB is drifted).

**Spec:** `docs/prd-white-label-website.md` (decisions D1-D9 are the recommended defaults until the owner answers).

## Global Constraints

- White-label is gated per parent organization by `organizations.white_label_enabled` (default false, set only by a super admin). No global flag. Off means byte-identical output to today.
- Only the parent's `admin` role edits the brand; clients inherit it and never receive the parent organization's id, only the brand fields.
- Brand fields: name 2-40 chars (rendered as text only); color `#RRGGBB`; slug 3-40, `[a-z0-9-]`, reserved words blocked (wbmsg, admin, api, www, support, billing, login, sign-in, sign-up, docs, settings, c); support email valid; image URLs must start with the R2 public URL; uploads png/jpg/webp (favicon also ico), logo max 1 MB, favicon max 256 KB, SVG refused.
- Every new route has org scoping, an RBAC check and a cross-tenant negative test. Public brand reads are rate limited and give the same body for unknown, disabled and non-parent slugs.
- Part A (website): sender address unchanged (`SMTP_USER`), only the display name changes; the From name is sanitized (no CR/LF, no angle brackets) to prevent header injection. Part B replaces the sender with the parent's verified provider, with our sender as fallback.
- Billing pages, statements and billing emails stay WBMSG-branded (D4). Marketing, legal and docs pages stay WBMSG.
- Secrets rule: no literal credentials; tests use fakes. No "Plivo" in customer-facing text. LF line endings in the index, no NUL/binary files.

## Review Focus

- A parent brands itself as another company (name, slug, color): blocked by the super admin approval and reserved slugs; test that nothing shows until approved.
- Parent B's clients see parent A's brand, or a client receives the parent's id.
- A logo URL pointing to an arbitrary host or an SVG with script is accepted.
- First paint shows "WBMSG" for a branded client (flash), or a title/favicon of the wrong brand.
- Branded sign-in leaks whether an email/account exists, or the public brand endpoint enumerates slugs.
- An email header injection through the brand name; brand emails sent to users of an unbranded org.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/migrations/2026102200xxxx_white_label/migration.sql`, `schema.prisma` | New columns |
| `apps/api/src/lib/brand.ts` (+ test) | Types, validators, palette generator, `resolveBrand` |
| `apps/api/src/routes/brand.ts` (+ test) | Brand settings, uploads, effective brand, public brand |
| `apps/api/src/routes/admin.ts` | Super-admin white-label toggle |
| `apps/api/src/lib/mail.ts`, `apps/web/app/api/internal/send-email/route.ts`, `apps/web/lib/mail.ts` | from-name plumbing |
| `apps/api/src/auth/emails.ts`, `lib/invitation-email.ts` | Brand-aware templates |
| `apps/web/components/brand/*`, `hooks/useBrand.ts`, `tailwind.config.ts`, `globals.css` | Provider, palette variables |
| `apps/web/app/(dashboard)/layout.tsx` and shell components | Brand injection, metadata |
| `apps/web/app/c/[slug]/...`, invite pages | Branded entry points |
| `apps/web/app/(dashboard)/settings/branding/page.tsx` | Rewritten settings |

---

### Task 1: Migration and brand library

**Files:** Create the migration, `apps/api/src/lib/brand.ts`, `brand.test.ts`; modify `schema.prisma`.

**Interfaces (Produces):**
```ts
export interface Brand { name: string; logoUrl: string | null; smallLogoUrl: string | null; faviconUrl: string | null;
  darkLogoUrl: string | null; darkSmallLogoUrl: string | null; darkFaviconUrl: string | null;
  primaryColor: string; supportEmail: string | null; hidePoweredBy: boolean; slug: string | null; isDefault: boolean }
export const DEFAULT_BRAND: Brand;                                  // WBMSG look, primaryColor "#22c55e", isDefault true
export function validateBrandInput(i: unknown): { ok: true; value: BrandInput } | { ok: false; field: string; message: string };
export function isAllowedAssetUrl(url: string): boolean;            // startsWith process.env R2_PUBLIC_URL, https
export function validateSlug(s: string): boolean;                   // format + reserved words
export function makePalette(hex: string): Record<"50"|"100"|"200"|"300"|"400"|"500"|"600"|"700"|"800"|"900", string>; // "#rrggbb" per shade
export async function resolveBrand(prisma: PrismaClient, orgId: string): Promise<Brand>; // own, else parent's, else DEFAULT_BRAND
```
- [ ] **Step 1:** Write failing tests: `makePalette("#22c55e")` returns today's exact scale (so the default is unchanged); an invalid hex, 1-char name, markup in name, reserved slug, SVG or non-R2 URL are rejected; `resolveBrand` returns own brand for an enabled parent, the parent's brand for its child, DEFAULT_BRAND when white-label is off or the parent has no brand, and never returns ids.
- [ ] **Step 2:** Run to FAIL. **Step 3:** Hand-write the additive SQL (`brand_name`, `brand_color`, `brand_support_email`, `white_label_enabled BOOLEAN NOT NULL DEFAULT false`, `brand_hide_powered_by BOOLEAN NOT NULL DEFAULT false`), mirror in `schema.prisma`, `prisma validate && prisma generate`, implement `brand.ts`. **Step 4:** PASS, type-check, commit.

### Task 2: Brand API (settings, upload, reads, super admin)

**Files:** Create `apps/api/src/routes/brand.ts` and test; modify `routes/organizations.ts` (old `/organizations/branding/*` routes now validate with `isAllowedAssetUrl` or are deprecated in favour of the new ones), `routes/admin.ts`, `routes/index.ts`.

**Interfaces:** `GET /v1/organizations/brand`, `PUT /v1/organizations/brand` (parent admin; fields name, color, supportEmail, slug, hidePoweredBy), `POST /v1/organizations/brand/assets/:slot` (slot in logo, smallLogo, favicon, darkLogo, darkSmallLogo, darkFavicon), `DELETE .../assets/:slot`, `GET /v1/brand` (any authenticated user: effective brand), `GET /v1/public/brand/:slug` (public, 30/min/IP), `PATCH /v1/admin/organizations/:orgId/white-label` body `{ enabled: boolean }` (super admin, audit).
- [ ] **Step 1:** Failing tests: non-admin 403; non-parent org 403; invalid slug/name/color 400 with the field named; slug already taken 409; upload rejects SVG, wrong type, oversize and stores a file under an org-scoped key; delete clears the slot; `GET /v1/brand` for a child returns the parent's brand without any id; another parent's brand never appears; public brand for unknown, disabled and non-parent slug returns the identical 404 body; the super-admin toggle needs `requireSuperAdmin`, writes an audit entry, and `white_label_enabled` false hides everything immediately.
- [ ] **Step 2-4:** FAIL, implement (reuse `lib/r2.ts` upload helper and the media-assets upload validation approach), PASS, commit. Security review (opus) of this task before moving on.

### Task 3: Email plumbing and brand-aware templates

**Files:** Modify `apps/api/src/lib/mail.ts` (`fromName?: string` in `MailOptions`), `apps/web/app/api/internal/send-email/route.ts`, `apps/web/lib/mail.ts`, `apps/api/src/auth/emails.ts`, `apps/api/src/lib/invitation-email.ts`; tests next to each.

**Interfaces:** `sendMail({ ..., fromName?: string })`; web side builds `from: "<sanitized name> <SMTP_USER>"` (falls back to `WBMSG`); templates accept an optional `brand: Pick<Brand, "name"|"logoUrl"|"supportEmail"|"hidePoweredBy">` and render today's exact output when it is omitted or default.
- [ ] **Step 1:** Failing tests: `fromName` with CR/LF, quotes or `<>` is sanitized (header-injection test); omitted brand gives byte-identical HTML to the stored snapshot; with a brand the logo (as `<img>` with the allowed URL), name and footer appear and "WBMSG" does not; sign-in code, password-changed, team invite and client invite pass the recipient org's effective brand and its support email as Reply-To; billing and closure emails stay unchanged.
- [ ] **Step 2-4:** FAIL, implement, PASS, commit.

### Task 4: Web foundation (provider, palette variables, metadata)

**Files:** Create `apps/web/components/brand/BrandProvider.tsx`, `apps/web/hooks/useBrand.ts`, `apps/web/lib/brand.ts`; modify `apps/web/tailwind.config.ts`, `app/globals.css`, `app/(dashboard)/layout.tsx`, `app/layout.tsx`.

**Interfaces:** `useBrand(): Brand` (default when no provider); `brandCssVars(brand): Record<string,string>` returns `--brand-50 ... --brand-900` as space-separated RGB channels; Tailwind `brand` colors become `rgb(var(--brand-500) / <alpha-value>)` with the default values in `:root` equal to today's hex; the dashboard layout fetches `GET /v1/brand` server-side (no-store), sets the CSS variables on a wrapper and `generateMetadata` for title template `%s | <Brand>` and icons.
- [ ] **Step 1:** Failing tests: `brandCssVars(DEFAULT)` equals today's palette; a branded provider changes the variables; `useBrand` default; the title template uses the brand name; with the default brand the rendered `<html>` head and class output is unchanged (snapshot).
- [ ] **Step 2-4:** FAIL, implement, PASS, run the full web suite (no visual regressions in snapshots), commit.

### Task 5: Replace hard-coded brand in the web app

**Files:** the dashboard shell (`Sidebar.tsx`, `TopBar.tsx`, `ProfileMenu.tsx`), onboarding pages, `CancelAccountCard`, `ConnectWhatsAppModal`, `ApiCredentialsSection`, settings pages, the places listed in the scan (about 28 dashboard strings, 4 onboarding, 7 auth/invite) except billing (D4) and public marketing/legal/docs.
- [ ] **Step 1:** Write a string-leak test that renders each touched component with a branded provider and asserts the output contains the brand name and none of `WBMSG`, `wbmsg.com`, `info@conveys.in` (the support email comes from the brand); and with the default brand renders exactly the old strings.
- [ ] **Step 2-4:** FAIL, replace strings and logos with `useBrand()` (logo `<img>` with the validated URL, alt = brand name; small logo for the collapsed sidebar; dark variants when the dark class is set), PASS, commit. Document the list of intentionally unchanged strings (billing, legal, marketing) in the commit message.

### Task 6: Branded entry points (invite pages and sign-in)

**Files:** `apps/web/app/c/[slug]/sign-in/page.tsx` (+ forgot password), the client and team invitation accept pages, `middleware-wbmsg.ts` and `lib/auth/provider-logic.ts` public-path lists, the invitation preview endpoints in the API (return `brand`).
- [ ] **Step 1:** Failing tests: `/c/<slug>/sign-in` renders the brand from the public endpoint and shows the default WBMSG page for an unknown slug (same page as today, no error that reveals existence); the client and team invite pages render the inviter's effective brand from the token; only `/c/*` became public; the forms post to the same auth endpoints (no new auth logic); emails to child-org users link to `/c/<slug>/sign-in` when a slug exists.
- [ ] **Step 2-4:** FAIL, implement, PASS, commit.

### Task 7: Branding settings page and super-admin toggle UI

**Files:** rewrite `apps/web/app/(dashboard)/settings/branding/page.tsx` (+ components), the super-admin organization page (white-label toggle).
- [ ] **Step 1:** Failing tests: the page loads current values; uploads go to the new asset route and show a preview; invalid file shows the API message; remove asks for confirmation; the color picker validates hex; slug conflict message; the page is visible only to parent admins and shows "pending approval" until a super admin enables white-label; "View as client" opens `/c/<slug>/sign-in`; the super-admin toggle shows only to super admins.
- [ ] **Step 2-4:** FAIL, implement, PASS, commit.

### Task 8: Verification, docs, rollout

- [ ] **Step 1:** Root lint, type-check, full API and web suites; a real-database smoke addition (brand resolve for parent, child and unrelated org; upload to a stubbed R2; email From sanitization) and a headless-browser pass on a scratch stack for the branded shell, `/c/<slug>/sign-in` and the invite pages (screenshots reviewed for overflow and contrast).
- [ ] **Step 2:** Security audit table for every new route (scoping, RBAC, cross-tenant test); docs `docs/white-label-website.md`; super admin approval checklist (name, slug, logo are the company's own).
- [ ] **Step 3:** Roll out with one pilot parent: super admin enables white-label after reviewing the brand. Rollback: toggle off.

---

## Part B: Email providers (all sending protocols)

Starts after Part A Task 3. Same rules as Part A. Extra constraints: credentials encrypted with AES-256-GCM using a key from the environment variable `EMAIL_SETTINGS_KEY` (fail loudly if missing); never returned, never logged; SMTP host and API base URLs checked against private/loopback/link-local ranges before any connection; ports 25/465/587/2525 only; TLS required unless explicitly accepted; test sends 5/hour/org; only our fixed templates use the provider (no arbitrary-send endpoint).

### Task B1: Settings table and crypto helper

**Files:** migration, `schema.prisma`, `apps/api/src/lib/secret-box.ts` (+ test).
**Interfaces:** `encryptJson(value: unknown): string`, `decryptJson<T>(blob: string): T` (AES-256-GCM, random 12-byte IV, version prefix, throws if `EMAIL_SETTINGS_KEY` is not 32 bytes base64); table `org_email_settings(organization_id UNIQUE, provider TEXT, from_address, from_name, reply_to, config_enc TEXT, status TEXT DEFAULT 'unverified', consecutive_failures INT DEFAULT 0, last_error TEXT, last_tested_at, created_at, updated_at)`.
- [ ] Failing tests: round trip; tampered blob fails; two encryptions of the same value differ; wrong/missing key throws. Hand-written SQL, `prisma validate`, commit.

### Task B2: Transport interface and adapters

**Files:** `apps/api/src/lib/email/transport.ts`, `providers/{smtp,sendgrid,mailgun,postmark,resend,brevo,ses,sparkpost}.ts`, `safe-host.ts`, tests per adapter.
**Interfaces:** `interface EmailTransport { send(m: { from: string; to: string; subject: string; html: string; replyTo?: string }): Promise<{ ok: true } | { ok: false; retryable: boolean; reason: string }> }`; `buildTransport(provider: string, config: unknown): EmailTransport`; `assertSafeHost(host: string, port: number): Promise<void>` (reuse the existing safe-URL logic).
- [ ] Failing tests per HTTP adapter against a mocked `fetch`: exact URL, auth header and JSON/form body; 401/403 become non-retryable, 5xx/timeout retryable; the API key never appears in thrown messages. SMTP adapter: builds the relay request to the web route (Railway cannot open SMTP); unsafe hosts (127.0.0.1, 10.x, 169.254.x, metadata IP, localhost, IPv6 loopback) refused; port allow-list. Commit.

### Task B3: Settings API with verification

**Files:** `apps/api/src/routes/email-settings.ts` (+ test), `routes/index.ts`.
**Interfaces:** `GET /v1/organizations/email-settings` (never returns secrets; returns provider, from, status, last error, `hasCredentials`), `PUT` (validates per provider, resets status to unverified), `POST /test` (sends to the calling admin's own address; success sets `verified`), `DELETE`. Parent admin only; clients cannot read or write.
- [ ] Failing tests: non-admin 403; non-parent 403; response never contains credentials; invalid host/port 400; test endpoint rate limit; a failed test leaves it unverified and stores only a sanitized reason; audit rows for create/update/delete (no secret in metadata). Commit; security review.

### Task B4: Use the provider when sending

**Files:** `apps/api/src/lib/mail.ts` (new `sendOrgMail(prisma, orgId, message)`), the Part A email builders' call sites, the web relay route for SMTP.
**Interfaces:** `sendOrgMail` resolves the effective email settings (own, else the parent's) and uses the verified transport; on a failed send it retries once from our default sender, increments `consecutive_failures`, marks `failing` at 3 and emails the parent admin from our sender; success resets the counter. Billing, statement and admin emails keep using `sendMail`.
- [ ] Failing tests: verified provider used for sign-in code, invites; unverified or failing setting is ignored; fallback exactly once; a thrown adapter error never loses the email; counter and status transitions; credentials never in logs; relay route accepts SMTP settings only with the internal bearer. Commit.

### Task B5: Email settings UI

**Files:** `apps/web/app/(dashboard)/settings/email/page.tsx` (+ components).
- [ ] Failing tests: provider picker shows the right fields per provider; password fields are write-only (never prefilled); Test button shows success or the sanitized reason; status badge; delete confirms; plain help text about SPF/DKIM; visible to parent admins only. Commit.

### Task B6: Verification

- [ ] Real SMTP test against a throwaway local mail catcher container (scratch ports only): the verified flow, the fallback and the failing state; HTTP adapters against recorded contract fixtures; `pnpm lint`, type-check, full suites; security audit table; docs; rollout: pilot with one parent and a throwaway provider account.

## Self-review

- **PRD coverage:** goals 1 to 6 map to tasks 4-5 (brand in app), 6 (entry points), 3 (email), 2 (approval gate, validation, upload fix), 7 (settings). Non-goals respected: billing, legal, marketing, mobile, domain untouched.
- **Ordering:** 1 before 2 and 3; 2 before 4 (needs `GET /v1/brand`); 4 before 5 and 6; 7 last.
- **Not verified yet:** Next.js merging of per-segment icons, dark mode behaviour, whether `R2_PUBLIC_URL` is configured in production, billing payer.
