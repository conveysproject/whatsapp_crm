# Plan: remove old plan pricing everywhere; show the live bands

Owner decisions (2026-10-16):
- The public pricing section reads the live bands published in Admin > Billing.
- The profile-menu plan badge is removed.
- "14-day free trial" becomes "500 messages free every month".
- The Conveys company blog post on Meta's rates is left alone.

## Spec

**Problem (evidence).** Old flat-plan pricing is still shown in the product:
- `apps/web/app/(public)/pricing-section.tsx:9-90` shows Free / ₹299 / ₹599 / ₹1,999 plans with agent and contact limits, an annual toggle and "Start 14-Day Trial".
- `apps/web/app/(public)/page.tsx`: the demo chat (285-299) says "Growth is ₹599/mo… 14-day free trial", the AI insight (430-434) says "Recommend Growth plan", and the CTA (464) says "Start Free — 14 Days".
- `apps/web/lib/docs/content/getting-started.ts:38-43,74` lists Starter $12 / Growth $36 / Scale $96 and the 14-day trial.
- `apps/web/components/layout/ProfileMenu.tsx:115-121` shows a plan badge (every org is "starter").
- `apps/api/scripts/seed-auto-replies.mjs:19` seeds Basic ₹999 / Pro ₹2,499.
- Prod: the Conveys "pricing" auto-reply shows Basic ₹999 / Pro ₹2,499. Its keyword is one literal string (`"price, pricing, cost, charges, plan, plans, quote"`) with `contains`, so it never matches (`apps/api/src/workers/inbound-message.worker.ts:38-50`).

**Live model:** 500 messages free each month, then volume bands with a hard cap (prod: ₹500 / ₹700 / ₹1,200 and $5 / $7 / $12). Unlimited team members and contacts. Only messages Meta charges for are counted. No markup on Meta. The bands are stored in `billing_settings` and edited in Admin > Billing (`apps/api/src/lib/billing/settings.ts`, `bands.ts`).

**Design.**
1. **API `GET /v1/public/pricing`.** New file `routes/public-pricing.ts`, using the `{ config: { public: true } }` route option the auth plugin already honors (`plugins/auth.ts:88`), and registered in `routes/index.ts`.
   - When published, it returns `{ data: { published: true, freeAllowance, bands: bandViews(config) } }`.
   - Otherwise it returns `{ data: { published: false, freeAllowance } }`.
   - It never returns other config fields (seller, GST, blocking mode, charging dates).
   - It uses `loadBillingConfig`, which already falls back to the unpublished draft on a bad row (`settings.ts:7-16`).
   - It's read-only, holds no tenant data, and uses no org scoping or RBAC (by design). The global rate limiter applies.
2. **Web landing page.** `LandingPage` becomes an async server component. It fetches the endpoint with `next: { revalidate: 300 }` and passes the result to `PricingSection`. If the fetch fails or prices are unpublished, it shows "500 messages free every month" and a "Talk to us" CTA, with no prices.
3. **`PricingSection` rewrite.** An INR / USD toggle replaces monthly / annual. There's one card per band: Free, then each band with its message range, and the cap marked "Max — never more". Shared features, all existing: unlimited team members & contacts, every feature (inbox, campaigns, flows, chatbots, AI replies, API), support replies not counted, no markup on Meta. A note says Meta's own charges are billed by Meta directly. The card-building logic lives in a pure helper `lib/public-pricing.ts` with unit tests.
4. **Landing copy.**
   - The demo chat shows the new pricing ("Pay only for messages you send — 500 free every month, never more than ₹1,200").
   - The AI insight becomes "asked about pricing twice — share pricing".
   - The CTA becomes "Start Free — 500 messages/month".
   - The numbers in the decorative mockups are text and match prod today.
5. **Docs `getting-started.ts`.** Replace the plan list and trial text with the model, without hard-coded prices: "500 messages free every month; after that one monthly bill by volume band, with a cap; current prices on the pricing page and in Settings → Billing."
6. **`ProfileMenu`:** remove the plan badge and the `planLabel` map.
7. **Seed script:** new pricing reply text and a regex keyword.
8. **Prod data (Conveys org only):** update the pricing auto-reply.
   - Set `triggerType: "regex"` with keyword `\b(price|prices|pricing|cost|charges|plans?|quote)\b`, so "Send pricing" matches too.
   - New text: free 500 / ₹500 / ₹700 / ₹1,200 cap, unlimited team, no Meta markup, plus Aparna's number.
   - Dry run first, then `--apply` after the owner confirms.

**Out of scope:** the legacy subscription code (`/billing/plans`, `PLAN_CATALOG`, the payment-failed email that mentions Starter), the Conveys company blog, the approved Meta template ("Free plan available" is still true), and other orgs' data.

**Rollout:** web and API ship in one push. The API must deploy before the web build fetches it. If the fetch fails, the page falls back to showing no prices, so the order isn't critical. Roll back by reverting. The prod data change is reversible: the old text is printed in the dry run.

## Tasks (TDD)
1. API: write tests for `public-pricing.ts` (published → bands; unpublished → no prices; no extra fields; no auth needed). Then the route and its registration.
2. Web: write tests for `lib/public-pricing.ts` (card building, INR/USD formatting, cap label, unpublished fallback). Then the helper.
3. Web: rewrite `PricingSection`, make `page.tsx` async with the fetch, and update the landing copy.
4. Web: update the docs content and remove the ProfileMenu badge.
5. API seed script text.
6. Run `/check`, `/test-api` and `/test-web`.
7. Merge locally. Push when the owner says.
8. Prod auto-reply: dry run, then apply after confirmation.
