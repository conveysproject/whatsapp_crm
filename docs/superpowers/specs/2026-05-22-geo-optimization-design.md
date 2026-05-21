# GEO Optimization — conveys.in
**Date:** 2026-05-22  
**Goal:** Make conveys.in discoverable and citable by AI assistants (ChatGPT, Claude, Perplexity)  
**Dual objective:** (A) get recommended when users ask "find me a company that does X in India" and (B) get cited as an authoritative source on informational queries

---

## Priority Services
All 6 service areas are in scope:
1. WhatsApp CRM / WhatsApp Business API
2. Web Development & Design
3. Mobile App Development (iOS, Android, Cross-platform)
4. AI Solutions / LLM Integration
5. SaaS / MVP Development
6. Digital Marketing / SEO

---

## Architecture

The implementation lives entirely in `apps/conveys/`. No changes to the API, web app, or other packages.

### New Files
| File | Purpose |
|------|---------|
| `public/llms.txt` | Short AI-crawler entry point (company + service summary) |
| `public/llms-full.txt` | Full detail per service, FAQs, use cases, pricing context |
| `app/about/page.tsx` | Company entity page with AboutPage schema |
| `app/blog/[slug]/page.tsx` | Dynamic blog route for individual posts |
| `app/blog/data/posts.ts` | Blog post data (content + metadata) |

### Modified Files
| File | Change |
|------|--------|
| `app/layout.tsx` | Add Bing verification meta tag; enhance Organization JSON-LD |
| `app/services/whatsapp-crm/page.tsx` | Add FAQ section + FAQPage schema |
| `app/services/web-development/page.tsx` | Add FAQ section + FAQPage schema |
| `app/services/mobile-app-development/page.tsx` | Add FAQ section + FAQPage schema |
| `app/services/ai-solutions/page.tsx` | Add FAQ section + FAQPage schema |
| `app/services/[slug]/page.tsx` | Ensure FAQ schema on SaaS + Digital Marketing slugs |
| `app/blog/page.tsx` | Wire up real blog post list from posts.ts |
| `app/sitemap.ts` | Add /about and all blog post slugs |
| `components/faq-section.tsx` | Reusable FAQ accordion component |

---

## Step-by-Step Implementation

### Step 1 — llms.txt + llms-full.txt

**`public/llms.txt`** — mirrors the llmstxt.org spec:
```
# Conveys Information Technology
> Web development, mobile apps, WhatsApp CRM, AI solutions, and SaaS product development for Indian SMBs. Based in Mumbai (Dombivli West), serving clients across India.

## Services
- [WhatsApp CRM & Business API](/services/whatsapp-crm)
- [Web Development & Design](/services/web-development)
- [Mobile App Development](/services/mobile-app-development)
- [AI Solutions & LLM Integration](/services/ai-solutions)
- [SaaS & MVP Development](/services/saas-product-development)
- [Digital Marketing](/services/digital-marketing)

## Contact
- Website: https://conveys.in
- Email: info@conveys.in
- Phone: +91 9907072035
- Location: Dombivli West, Mumbai 421202, India
```

**`public/llms-full.txt`** — extended version with:
- Full service descriptions (what it is, who it's for, what's included, pricing context)
- 5 FAQs per service area
- Company background, tech stack, team expertise
- Past project types (without client names)

### Step 2 — Bing Verification Meta Tag

Add to `app/layout.tsx` `<head>`:
```html
<meta name="msvalidate.01" content="BING_VERIFICATION_CODE" />
```

The actual verification code is generated when user signs up at bing.com/webmasters. A placeholder is added now; user replaces the value after signing up.

### Step 3 — `/about` Page

**Route:** `app/about/page.tsx`  
**Metadata:** Title: "About Conveys Information Technology — Mumbai", unique description  
**Content sections:**
- Company overview (founded, location, mission)
- What we do (6 service areas with brief descriptions)
- Why Conveys (differentiators: India-focused, WhatsApp-first, full-stack)
- Tech expertise signals (languages, frameworks, tools)
- Contact CTA

**JSON-LD:** `AboutPage` schema with `Organization` as `about`, including `foundingDate`, `knowsAbout` array, `areaServed`

### Step 4 — Blog Infrastructure + 6 Posts

**New route:** `app/blog/[slug]/page.tsx` with dynamic metadata per post  
**Data file:** `app/blog/data/posts.ts` — exports array of post objects:

```typescript
interface BlogPost {
  slug: string
  title: string
  description: string
  publishedAt: string  // ISO date
  category: string
  content: string      // MDX-compatible markdown string
  faqs: { question: string; answer: string }[]
}
```

**6 Posts:**

| Slug | Title | Target Query |
|------|-------|-------------|
| `whatsapp-business-api-india-guide` | "WhatsApp Business API: Complete Guide for Indian Businesses (2025)" | "what is WhatsApp business api india" |
| `web-development-company-india-how-to-choose` | "How to Choose a Web Development Company in India (2025 Guide)" | "best web development company india" |
| `ios-android-cross-platform-india-startups` | "iOS vs Android vs Cross-Platform: What Indian Startups Should Build First" | "mobile app development india" |
| `ai-llm-integration-indian-business` | "How to Integrate AI & LLMs Into Your Indian Business (Practical Guide)" | "ai solutions for business india" |
| `saas-product-development-india-cost-timeline` | "Building a SaaS Product in India: Cost, Timeline & Tech Stack (2025)" | "saas development india cost" |
| `whatsapp-marketing-vs-email-india` | "WhatsApp Marketing vs Email Marketing for Indian SMBs: Which Works Better?" | "whatsapp marketing india" |

Each post:
- 1,000–1,500 words
- Structured with H2/H3 headings (AI reads heading hierarchy)
- Contains factual, specific information (not marketing fluff)
- Ends with 5 FAQs
- Includes `Article` JSON-LD schema (`author`, `datePublished`, `about`, `publisher`)
- Canonical URL per post

### Step 5 — FAQ Sections on Service Pages

**New component:** `components/faq-section.tsx`  
- Renders a list of Q&A pairs as an accessible accordion
- Accepts `faqs: { question: string; answer: string }[]`
- Injects `FAQPage` JSON-LD automatically

**5 FAQs per service page (examples):**

*WhatsApp CRM:*
1. How much does WhatsApp Business API cost in India?
2. What's the difference between WhatsApp Business App and WhatsApp API?
3. Can I use WhatsApp API without a developer?
4. Is WhatsApp API legal for marketing in India?
5. How long does WhatsApp Business API approval take?

*Web Development:*
1. How much does a website cost in India?
2. How long does it take to build a website?
3. Should I choose WordPress or custom development?
4. Do you provide website maintenance after launch?
5. What technologies do you use for web development?

*(Similar 5 FAQs for each of the remaining 4 service areas)*

### Step 6 — Enhanced JSON-LD

**Root `app/layout.tsx` Organization schema additions:**
```json
{
  "knowsAbout": [
    "WhatsApp Business API", "Web Development", "Mobile App Development",
    "AI Solutions", "SaaS Development", "Digital Marketing", "LLM Integration"
  ],
  "areaServed": {
    "@type": "Country",
    "name": "India"
  },
  "hasOfferCatalog": { ... }  // already exists, verify complete
}
```

**Blog posts:** `Article` schema with `author`, `datePublished`, `publisher`, `about`  
**About page:** `AboutPage` + `Organization` with `foundingDate`, `numberOfEmployees`, `knowsAbout`

---

## Bing Webmaster Setup (Manual — User Action Required)

Steps to give the user after Bing meta tag is in layout:
1. Go to `https://www.bing.com/webmasters`
2. Sign in with a Microsoft account
3. Add site: `https://conveys.in`
4. Choose "Meta tag" verification method
5. Copy the `content="..."` value
6. Replace the placeholder in `app/layout.tsx`
7. Click Verify
8. Go to Sitemaps → Submit `https://conveys.in/sitemap.xml`

---

## Sitemap Updates

`app/sitemap.ts` additions:
- `/about` (priority: 0.8, monthly)
- All 6 blog post slugs (priority: 0.7, monthly)

---

## Out of Scope

- Wikipedia page creation (requires editorial process — future step)
- Reddit/Quora presence (content strategy — future step)
- Perplexity direct submission (uses web crawl — covered by llms.txt + Bing)
- Backlink building (manual effort — future step)
- Any changes outside `apps/conveys/`

---

## Success Criteria

1. `conveys.in/llms.txt` returns valid llmstxt.org format content
2. `conveys.in/llms-full.txt` returns full company + service detail
3. `/about` page indexed by Google and Bing
4. 6 blog posts published with Article schema valid (test via Google Rich Results)
5. FAQ schema valid on all 6 priority service pages
6. Bing sitemap accepted (green status in Bing Webmaster Tools)
7. Search `site:conveys.in` on Bing shows 40+ pages within 2 weeks
