# PRD: White-label website (no domain / DNS)

Status: DRAFT for owner sign-off (2026-10-22). No code is written until this is approved.
Related: `docs/prd-parent-child-orgs.md` (a parent's clients are child organizations), `docs/parent-child-orgs.md`.
Evidence: read-only scan of the repo at main `7e25bbe8` (file:line given where read). Items marked **Unverified** were not confirmed at runtime.

## 1. Problem

A parent company (agency / reseller) wants its clients to see the parent's brand in the web app, not "WBMSG": the parent's name, logo, favicon, colors, email wording and a branded sign-in page. The first stage covers the website only. Custom domains, DNS, and sending email from the parent's own domain are a later stage and are out of scope here.

## 2. What exists today (evidence)

- The organization table already has `slug` (unique), `domain` (unused), light/dark `logoImage`, `smallLogoImage`, `favicon` (`apps/api/prisma/schema.prisma:59-70`).
- The Settings, Branding page (`apps/web/app/(dashboard)/settings/branding/page.tsx`) is upload-only, shows no current values, and uploads to `/api/upload`. **That route does not exist** (`apps/web/app/api` holds only auth, billing, impersonation, internal, register, v1). So saving a logo does not work today. Verified.
- **No uploaded logo is rendered anywhere** in the web app (zero reads of `logoImage` / `favicon`). The sidebar logo and the sign-in logos are hard-coded. Verified.
- The five `POST /organizations/branding/*` routes accept any string as the URL (no schema, no host allow-list) (`apps/api/src/routes/organizations.ts:130-154`).
- A working upload exists on the API: `POST /v1/media-assets/upload` stores to R2 (`apps/api/src/routes/media-assets.ts:60`, `lib/r2.ts`). No branding-specific size or type limit.
- The brand color is a fixed Tailwind scale (`apps/web/tailwind.config.ts:11-22`, green). About 416 `brand-*` class uses in 79 files; the CSS variable `--color-brand` is barely used. Dark mode toggling is likely broken (no `darkMode` key; **Unverified** at runtime) and is out of scope.
- "WBMSG" appears as a static string in about 40 dashboard, auth, onboarding and invite places, in the page title template and icons (`apps/web/app/layout.tsx:11-41`), the manifest, and the support email `info@conveys.in` in three places. Marketing, legal and docs pages (about 110 occurrences) are WBMSG's own public site.
- Emails: one fixed sender `WBMSG <SMTP_USER>` (`apps/web/lib/mail.ts:28`); the mail API passes only `to`, `subject`, `html`, `replyTo` (no from-name) (`apps/api/src/lib/mail.ts`, `apps/web/app/api/internal/send-email/route.ts`). About 10 builders: sign-in / reset codes, password changed, team invite, client invite, billing, closure notice.
- Unauthenticated pages (sign-in, sign-up, forgot password) have **no way to know which brand to show**: there is no host or slug routing (`middleware-wbmsg.ts`). Invitation pages can: the invite token identifies the inviter.
- The dashboard layout is a server component that already fetches the organization, so a brand can be fetched once per request without a flash of the wrong brand.

## 3. Goals

1. A parent company sets one brand; its own users and all its linked clients see that brand in the web app: name, logo, favicon, primary color, page titles, support email.
2. Branded entry points without a custom domain: invitation pages (client and team) and a branded sign-in page at a path like `wbmsg.com/c/<slug>`.
3. Emails sent to those users carry the brand name, logo and footer and are sent as "<Brand> <our verified address>" with the parent's support address as reply-to.
4. A brand is shown only after a super admin approves it (anti-impersonation).
5. Organizations without a brand see exactly what they see today (no visual change).
6. Fix the broken branding upload and validate what is stored.

## 4. Non-goals

- Custom domains, DNS, TLS, host-based routing. Sending email from the parent's own domain address.
- The mobile app, the marketing site (`apps/conveys`), WBMSG's public marketing, legal and docs pages (they stay WBMSG; the legal operator stays Conveys).
- Billing: the billing pages, statements, PDFs and billing emails stay WBMSG-branded (see decision D4).
- Fixing dark mode. Replacing the green semantic colors (WhatsApp green, success states); only the `brand-*` palette follows the brand.
- Per-client brands (a client choosing its own brand): clients inherit their parent's.

Anti-goals: a brand that lets one company impersonate another; a logo URL pointing anywhere on the internet; a flash of the WBMSG brand before the client's brand; any parent-organization identity leaking to clients beyond the brand itself.

## 5. Design

**Brand object** `{ name, logoUrl, smallLogoUrl, faviconUrl, dark variants, primaryColor, supportEmail, hidePoweredBy }`. Effective brand of an organization = its own brand if it is a parent with white-label enabled, else its parent's brand if the parent has white-label enabled, else the WBMSG default (current look).

**Data (hand-authored migration, additive):** `organizations.brand_name TEXT`, `brand_color TEXT` (hex), `brand_support_email TEXT`, `white_label_enabled BOOLEAN NOT NULL DEFAULT false`, `brand_hide_powered_by BOOLEAN NOT NULL DEFAULT false`. The existing image columns and `slug` are reused. `white_label_enabled` is set only by a super admin.

**API**
- `GET/PUT /v1/organizations/brand`: parent admin only; validated (name 2-40 chars no markup; color `#RRGGBB`; slug 3-40, lowercase letters, digits, hyphens, reserved words blocked; support email; image URLs must be under our R2 public URL).
- `POST /v1/organizations/brand/assets/:slot`: multipart upload to R2, png/jpg/webp (and ico for favicon), size limit (logo 1 MB, favicon 256 KB), SVG refused.
- `GET /v1/brand`: authenticated; returns only the caller's effective brand fields.
- `GET /v1/public/brand/:slug`: public, rate limited; returns the brand only when white-label is enabled.
- Invitation preview endpoints (client and team) also return the brand; no parent id is exposed.
- `PATCH /v1/admin/organizations/:id/white-label` super admin, with audit.

**Web:** `BrandProvider` fed by the server-rendered dashboard layout (no flash); a `useBrand()` hook replaces the hard-coded logo and name in the shell, onboarding, auth and invite pages; `generateMetadata` for title and favicon in the dashboard segment; the `brand-*` Tailwind scale becomes CSS variables set from the brand color (defaults equal today's green, so nothing changes by default); a rewritten Branding page with current values, preview, remove, and "view as client".

**Email:** `fromName` plumbed through API mail helper, internal send route and web mail; sender address stays our verified mailbox; templates take a brand (name, logo URL, footer, support email); the From name is sanitized (no header injection).

**Security:** brand is data, rendered as text or validated URL only; super admin approval gate; slug reserved words (wbmsg, admin, api, www, support, billing, login, etc.); branded sign-in never reveals whether a user exists; public brand endpoint is rate limited and returns nothing for unknown or disabled slugs (same body).

## 6. Decisions needed (recommended default first)

| # | Decision | Default |
|---|---|---|
| D1 | Who sets the brand | The parent sets it; its clients inherit (no per-client brand) |
| D2 | Super admin approval before a brand shows | Yes (`white_label_enabled`) |
| D3 | Parent's own dashboard also shows its brand | Yes |
| D4 | Billing pages, statements and billing emails | Stay WBMSG-branded (billing is between WBMSG and each organization). **Contract question for you**: clients may object to seeing WBMSG there |
| D5 | "Powered by WBMSG" | Hidden when white-label is on (check your terms) |
| D6 | Branded sign-in at a path (`wbmsg.com/c/<slug>`) | Yes (no domain needed) |
| D7 | Logo formats | png, jpg, webp (favicon also ico); no SVG |
| D8 | Support email shown to clients | Required when white-label is enabled; no fallback to our address |
| D9 | Legal pages and terms | Stay WBMSG / Conveys; add white-label terms in your contract (not engineering) |

## 7. Acceptance criteria

- With white-label off, every page and email is byte-identical to today (snapshot tests).
- With it on, a client user sees the brand name, logo, favicon, color and title on every dashboard, onboarding, invite and branded sign-in page; no "WBMSG" in those components (automated string-leak test).
- No flash: the first server render already contains the brand.
- Another parent's clients never see this brand; a client never receives the parent organization's id.
- Upload rejects SVG, oversize and non-image files; the stored URL must be under our R2 public URL.
- Brand emails: From name is the brand, Reply-To is the support email, templates show the brand; the sender address is unchanged.
- Existing Branding page works end to end (upload, preview, remove).

## 8. Rollout and rollback

No global flag: the gate is `white_label_enabled` per parent (default off, so zero change for everyone). Pilot with one parent. Rollback for one parent: super admin turns white-label off (instant). Migration is additive.

## 9. Risks and open questions

- Impersonation of other companies through the brand name: mitigated by D2 (super admin approval), but needs an approval checklist.
- About 40 static strings and about 12 logo spots must all be found; the string-leak test is the net.
- The Next.js behaviour of merging per-segment icons and the manifest is **Unverified**; a dynamic manifest is Phase 2.
- Whether billing is paid by each client or by the parent is not decided (affects D4).
- Contract and terms: not an engineering item.
