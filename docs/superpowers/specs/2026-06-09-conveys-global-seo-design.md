# conveys.in — Global SEO Overhaul Design

**Date:** 2026-06-09
**Scope:** `apps/conveys/` only
**Goal:** Reposition conveys.in from India-only to global-first to grow international search impressions and clicks.

---

## Problem

GSC data (May–June 2026) shows 4 total clicks from 64 impressions over ~3.5 weeks. India dominates (50 impressions) while US has 11 impressions at position 6.18 with zero clicks. Root causes:

1. `lang="en-IN"` and `locale: "en_IN"` signal India-local content to Google.
2. Organization JSON-LD `areaServed` restricted to `Country: India`.
3. Root metadata description and keywords contain "India" and "Mumbai".
4. All 5 blog posts have "India" baked into slugs and titles — suppressed internationally.
5. Service page titles contain "Mumbai" (e.g. "WhatsApp Business API & CRM — Mumbai").
6. No `hreflang` tag to signal global English targeting.
7. GSC shows both `http://` and `https://` homepage — canonical split.

---

## Section 1 — Technical Fixes

### `apps/conveys/app/layout.tsx`

| What | From | To |
|------|------|----|
| `<html lang>` | `en-IN` | `en` |
| OG `locale` | `en_IN` | `en_US` |
| Root `description` | "...for businesses across India...Based in Mumbai." | "...for businesses worldwide. Fixed pricing, in-house team." |
| Root `title.default` | "Conveys IT — Web Development, Mobile Apps & AI Solutions" | unchanged (already globally neutral) |
| Root `keywords` | India/Mumbai-specific terms | Replace with global: `"web development agency"`, `"WhatsApp CRM software"`, `"SaaS development company"`, `"AI solutions for business"`, `"mobile app development agency"`, `"cross-platform app development"`, `"WhatsApp Business API"`, `"custom software development"`, `"SaaS product development"`, `"ecommerce development agency"` |
| OG `description` | "...across India. Get a free quote today." | Remove "across India" |
| Twitter `description` | "...across India." | Remove "across India" |
| `alternates.canonical` | `https://conveys.in` | unchanged (already correct) |
| Org JSON-LD `areaServed` | `{ "@type": "Country", name: "India" }` | `{ "@type": "AdministrativeArea", name: "Worldwide" }` |
| Org JSON-LD `description` | "...in Mumbai, India. We build...for Indian SMBs..." | "...We build...for SMBs and startups globally." |
| `<head>` additions | — | `<link rel="alternate" hreflang="en" href="https://conveys.in" />` |

### `apps/conveys/next.config.ts`

Add `redirects` to enforce HTTPS (eliminates the `http://` canonical split seen in GSC):

```ts
async redirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      destination: 'https://conveys.in/:path*',
      permanent: true,
    },
  ]
}
```

### Service pages — metadata + JSON-LD

**`apps/conveys/app/services/whatsapp-crm/page.tsx`**
- Title: `"WhatsApp Business API & CRM — Mumbai"` → `"WhatsApp CRM & Business API for Small Business"`
- Description: remove "in India" → "Set up WhatsApp Business API for your business. Automate conversations, run broadcast campaigns, and manage your customer pipeline."
- JSON-LD `areaServed`: `Country: India` → `AdministrativeArea: Worldwide`

**All other service pages** — audit and remove "India"/"Mumbai" from `<Metadata>` title/description fields and any JSON-LD `areaServed` fields. (Most are generated via `apps/conveys/app/services/[slug]/page.tsx` or `apps/conveys/lib/services-data.ts` — fix at the data layer.)

---

## Section 2 — Existing Content Cleanup

**Blog posts** (`apps/conveys/app/blog/data/posts.ts`) — slugs are **not changed** (preserve existing rank). Updates:

| Post | Change |
|------|--------|
| `saas-product-development-india-cost-timeline` | Rewrite `intro` to open with global context; "India is the world's second-largest SaaS market" stays but is framed as an example, not the only audience. Update `description` to remove "in India". |
| `ios-android-cross-platform-india-startups` | Update `description` and `intro` to lead with global relevance; India market share stats remain as supporting data. |
| `ai-llm-integration-indian-business` | Update `description` title "Indian Business" → "Your Business"; update `intro` to remove India-only framing. |
| `web-development-company-india-how-to-choose` | `description` and `intro`: replace "Indian businesses" with "businesses" where possible. |
| `whatsapp-business-api-india-guide` | `description`: "Everything Indian businesses need to know" → "Everything businesses need to know". `intro`: lead with global WhatsApp stats before India stat. |

**Service page body copy** — scan H1/H2 headings and paragraph text across all 6 service pages. Replace region-gated phrases ("for Indian SMBs", "in India", "Mumbai-based") with globally neutral equivalents in visible on-page copy.

---

## Section 3 — New Global Blog Posts

Three new entries appended to `BLOG_POSTS` in `apps/conveys/app/blog/data/posts.ts`. Each follows the existing `BlogPost` schema (slug, title, description, publishedAt, category, readingTime, intro, sections[], faqs[]).

### Post 1: `whatsapp-crm-for-small-business`
- **Title:** "WhatsApp CRM for Small Business: Complete Guide (2025)"
- **Target keyword:** "WhatsApp CRM small business" / "WhatsApp CRM for business"
- **Category:** WhatsApp CRM
- **Mirrors:** `whatsapp-business-api-india-guide` but globally framed
- Sections: What is WhatsApp CRM, WhatsApp App vs API vs CRM, Key features to look for, Use cases (retail, services, e-commerce), Pricing (USD), How to get started
- FAQs: 5 questions covering CRM vs API, pricing, opt-in, team inbox, automation

### Post 2: `saas-product-development-cost-timeline`
- **Title:** "Building a SaaS Product: Cost, Timeline & Tech Stack (2025)"
- **Target keyword:** "SaaS product development cost" / "how to build a SaaS product"
- **Category:** SaaS Development
- **Mirrors:** `saas-product-development-india-cost-timeline` without India framing
- Sections: What is SaaS, Discovery phase, Design phase, Development phase, Cost breakdown (USD), Recommended stack, Common mistakes
- FAQs: 5 questions; pricing in USD

### Post 3: `cross-platform-vs-native-app-development`
- **Title:** "Cross-Platform vs Native App Development: Which Should You Choose? (2025)"
- **Target keyword:** "cross platform vs native app development"
- **Category:** Mobile App Development
- **Mirrors:** `ios-android-cross-platform-india-startups` without India framing
- Sections: Platform overview, Native Android, Native iOS, React Native, Flutter, Cost comparison (USD), Decision framework
- FAQs: 5 questions; global market data replaces India-specific stats

**Sitemap:** Auto-includes via existing `BLOG_SLUGS` map — no sitemap changes needed.

---

## What Is NOT Changing

- Existing blog slugs (preserve rank)
- Site structure, routing, components
- Pricing displayed on service pages (India-specific pricing stays in service pages — it's accurate for that market)
- Contact info / phone number (user's real contact details)
- Portfolio page
- Legal pages

---

## Success Criteria

- `lang="en"` confirmed in rendered HTML
- No `en_IN` locale in OG tags
- Organization JSON-LD `areaServed` = Worldwide
- 3 new blog posts live and in sitemap
- GSC re-crawl within 1–2 weeks shows new pages indexed
- US/UK impressions grow within 30 days of deploy
