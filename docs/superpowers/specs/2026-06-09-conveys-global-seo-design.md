# conveys.in — Global SEO Overhaul Design

**Date:** 2026-06-09
**Scope:** `apps/conveys/` only
**Goal:** Reposition conveys.in from India-only to global-first to grow international search impressions and clicks.

---

## Google Search Console Report (May 14 – Jun 7, 2026)

### Raw data

| Metric | Value |
|--------|-------|
| Total clicks | 4 |
| Total impressions | 64 |
| Overall CTR | 6.25% |
| Date range | ~25 days |

**Performance by country:**

| Country | Impressions | Avg Position | Clicks |
|---------|-------------|--------------|--------|
| India | 50 | 9.34 | 4 |
| United States | 11 | 6.18 | 0 |
| Italy | 1 | 2 | 0 |
| Oman | 1 | 5 | 0 |
| UK | 1 | 6 | 0 |

**Top pages by impressions:**

| Page | Impressions | Avg Position | Clicks |
|------|-------------|--------------|--------|
| `/blog/saas-product-development-india-cost-timeline` | 21 | 5.19 | 1 |
| `https://conveys.in/` | 16 | 5.12 | 1 |
| `/services/web-development` | 8 | 3.88 | 0 |
| `/blog/ai-llm-integration-indian-business` | 7 | 5 | 0 |
| `/blog/ios-android-cross-platform-india-startups` | 7 | 13.43 | 0 |
| `/about` | 7 | 23.86 | 0 |
| `/services/ai-solutions` | 6 | 5.33 | 0 |
| `/services/whatsapp-crm` | 6 | 7.83 | 0 |
| `http://conveys.in/` | 2 | 1.5 | 2 |

**Top queries (only 4 unique in 25 days):**

| Query | Impressions | Position |
|-------|-------------|----------|
| conveys | 3 | 9.33 |
| cross platform for ios and android | 2 | 15 |
| in india | 1 | 2 |
| cross platform for android and ios | 1 | 19 |

**Devices:**

| Device | Impressions | CTR | Clicks |
|--------|-------------|-----|--------|
| Desktop | 42 | 7.14% | 3 |
| Mobile | 22 | 4.55% | 1 |

**Search Appearance:** Empty — no rich results triggered.

### Issues identified from GSC

1. **HTTP/HTTPS canonical split** — `http://conveys.in/` and `https://conveys.in/` appear as separate pages (2 clicks on http, 1 on https). Google is indexing both; link equity is split. Fix: enforce HTTPS redirect + ensure all internal links and sitemaps use `https://`.

2. **Zero impressions for core commercial keywords** — No impressions for "WhatsApp CRM", "SaaS development", "mobile app development agency", etc. The site is not indexed for its primary service keywords yet. Fix: new global blog posts and optimised service page metadata will seed these keywords.

3. **Positions too low to convert** — `/services/whatsapp-crm` at 7.83, `/about` at 23.86, cross-platform blog at 13.43. Clicks require top 3. Fix: content depth + structured data (FAQPage, Service schema) to push closer to top 5.

4. **No rich results** — Search Appearance CSV is empty. None of the FAQPage or Article JSON-LD schemas are triggering rich snippets. Fix: verify structured data is valid with Google's Rich Results Test after deploy; ensure FAQPage JSON-LD is present on all blog posts and service pages.

5. **Only 4 unique queries in 25 days** — Site is not appearing for any long-tail queries because there is no content targeting them. Fix: three new global blog posts each targeting a specific long-tail keyword cluster.

6. **India-only geographic suppression** — US has 11 impressions at position 6.18 but 0 clicks — Google is showing pages to US users but the India-centric framing is hurting CTR. Fix: global-first metadata rewrite.

7. **`/about` at position 23.86** — Too deep to generate clicks. About page likely lacks enough keyword-relevant content. Fix: out of scope for this plan — flagged for future content pass.

---

## Problem Summary

GSC data (May–June 2026) shows 4 total clicks from 64 impressions over ~3.5 weeks. India dominates (50 impressions) while US has 11 impressions at position 6.18 with zero clicks. Root causes:

1. `lang="en-IN"` and `locale: "en_IN"` signal India-local content to Google.
2. Organization JSON-LD `areaServed` restricted to `Country: India`.
3. Root metadata description and keywords contain "India" and "Mumbai".
4. All 5 blog posts have "India" baked into slugs and titles — suppressed internationally.
5. Service page titles contain "Mumbai" (e.g. "WhatsApp Business API & CRM — Mumbai").
6. No `hreflang` tag to signal global English targeting.
7. GSC shows both `http://` and `https://` homepage — canonical split.
8. No rich results from existing FAQPage/Article JSON-LD — structured data not validated.
9. Zero impressions for core service keywords — no content targeting global long-tail queries.

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
