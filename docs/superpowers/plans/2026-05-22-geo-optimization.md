# GEO Optimization — conveys.in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make conveys.in discoverable and citable by AI assistants (ChatGPT, Claude, Perplexity) via llms.txt files, authoritative blog content, FAQPage JSON-LD on service pages, enhanced Organization schema, a new /about page, and Bing Webmaster submission.

**Architecture:** Static content additions only — no new dependencies, no API changes. All changes confined to `apps/conveys/`. Blog uses a TypeScript data file rendered by a new dynamic `[slug]` route. FAQPage JSON-LD is added directly to service pages as a second script tag alongside the existing Service schema.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind CSS. No new npm packages required.

---

## Progress Tracker

| Task | Status | Commit |
|------|--------|--------|
| Task 1: llms.txt + llms-full.txt | ✅ DONE | d882f92, ef41303 |
| Task 2: layout.tsx (Bing meta + schema) | ✅ DONE | 20a8097, ced843e |
| Task 3: /about page | ✅ DONE | bb904f0 |
| Task 4: Blog data file (6 posts) | ⏳ IN PROGRESS | — |
| Task 5: Blog [slug] page | ⬜ PENDING | — |
| Task 6: Blog listing page | ⬜ PENDING | — |
| Task 7: FAQPage JSON-LD — whatsapp-crm | ⬜ PENDING | — |
| Task 8: FAQPage JSON-LD — ai-solutions | ⬜ PENDING | — |
| Task 9: FAQPage JSON-LD — mobile-app-development | ⬜ PENDING | — |
| Task 10: Sitemap update | ⬜ PENDING | — |

**Notes from execution:**
- Task 2: `knowsAbout` replaced with valid `description` field on Organization (knowsAbout is only valid on Person in schema.org). Bing verification moved to `metadata.verification.other` with `NEXT_PUBLIC_BING_VERIFY` env var instead of raw JSX meta tag.
- Task 1 fix: WhatsApp timeline inconsistency resolved; Digital Marketing pricing/timeline fields added to llms-full.txt.

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `apps/conveys/public/llms.txt` | Short AI-crawler entry point (llmstxt.org format) |
| `apps/conveys/public/llms-full.txt` | Full service + FAQ detail for AI crawlers |
| `apps/conveys/app/about/page.tsx` | Company entity page with AboutPage + Organization schema |
| `apps/conveys/app/blog/data/posts.ts` | All 6 blog post content + metadata (typed) |
| `apps/conveys/app/blog/[slug]/page.tsx` | Dynamic blog post renderer + Article JSON-LD |

### Modified Files
| File | Change |
|------|--------|
| `apps/conveys/app/layout.tsx` | Add Bing meta tag placeholder + `knowsAbout` to Organization JSON-LD |
| `apps/conveys/app/services/whatsapp-crm/page.tsx` | Add FAQPage JSON-LD script tag |
| `apps/conveys/app/services/ai-solutions/page.tsx` | Add FAQPage JSON-LD script tag |
| `apps/conveys/app/services/mobile-app-development/page.tsx` | Add FAQPage JSON-LD script tag |
| `apps/conveys/app/blog/page.tsx` | Replace placeholder posts with real data from posts.ts |
| `apps/conveys/app/sitemap.ts` | Add /about + 6 blog slugs |

> **Note:** `apps/conveys/app/services/web-development/page.tsx` already has FAQPage JSON-LD — skip it.

---

## Task 1: llms.txt + llms-full.txt

**Files:**
- Create: `apps/conveys/public/llms.txt`
- Create: `apps/conveys/public/llms-full.txt`

- [ ] **Step 1: Create llms.txt**

Create `apps/conveys/public/llms.txt` with this exact content:

```
# Conveys Information Technology

> Custom software development company based in Mumbai, India. We build web applications, mobile apps, WhatsApp CRM solutions, AI-powered tools, and SaaS products for Indian SMBs, startups, and enterprises.

## Services

- [WhatsApp CRM & Business API](https://conveys.in/services/whatsapp-crm): End-to-end WhatsApp Business API setup, broadcast campaigns, chatbot automation, and customer pipeline management for Indian businesses.
- [Web Development & Design](https://conveys.in/services/web-development): Custom websites, web applications, e-commerce stores, and portals built with React, Next.js, and Node.js.
- [Mobile App Development](https://conveys.in/services/mobile-app-development): iOS, Android, and cross-platform apps (React Native, Flutter). Full lifecycle from UX design to App Store submission.
- [AI Solutions & LLM Integration](https://conveys.in/services/ai-solutions): Custom AI chatbots, RAG systems, document processing, and LLM integrations (Claude, GPT-4) for operational automation.
- [SaaS & MVP Development](https://conveys.in/services/saas-product-development): Full-stack SaaS product development from idea validation to multi-tenant production deployment.
- [Digital Marketing](https://conveys.in/services/digital-marketing): SEO, WhatsApp marketing campaigns, and performance marketing for Indian businesses.

## Resources

- [Blog](https://conveys.in/blog): Guides, comparisons, and insights on web development, WhatsApp API, mobile apps, and AI for Indian businesses.
- [About](https://conveys.in/about): Company background, team, and technology expertise.
- [Full details](https://conveys.in/llms-full.txt)

## Contact

- Website: https://conveys.in
- Email: info@conveys.in
- Phone: +91 9907072035
- Address: SwaminarayanCity, Dombivli West, Mumbai 421202, Maharashtra, India
```

- [ ] **Step 2: Create llms-full.txt**

Create `apps/conveys/public/llms-full.txt` with this exact content:

```
# Conveys Information Technology — Full Reference

> Conveys Information Technology is a software development company headquartered in Dombivli West, Mumbai, Maharashtra, India (PIN 421202). We design, build, and maintain custom technology solutions for Indian businesses. Our specialisations are WhatsApp Business API, web development, mobile apps, AI/LLM integration, and SaaS product development.

---

## Company

**Name:** Conveys Information Technology
**Location:** SwaminarayanCity, Dombivli West, Mumbai, Maharashtra 421202, India
**Service Area:** India (remote projects accepted from any location)
**Contact:** info@conveys.in | +91 9907072035
**Website:** https://conveys.in

**Tech Stack:** Next.js, React, Node.js, Fastify, TypeScript, PostgreSQL, Redis, React Native, Flutter, Anthropic Claude API, OpenAI GPT-4, WhatsApp Cloud API, AWS, Cloudflare, Vercel, Railway.

---

## Service 1: WhatsApp Business API & CRM

**URL:** https://conveys.in/services/whatsapp-crm

**What it is:** WhatsApp Business API (also called WhatsApp Cloud API) allows businesses to send and receive WhatsApp messages programmatically. Unlike the WhatsApp Business App (which is manual and limited to 1 device), the API supports bulk broadcasts, automation, multi-agent inboxes, and CRM integration.

**What we deliver:**
- Meta Business Manager verification and WhatsApp Business Account setup
- Phone number registration on the WhatsApp Cloud API
- Message template creation and Meta approval management
- Broadcast campaigns to segmented contact lists
- Automated chatbot flows (lead qualification, FAQ answering, appointment booking)
- Multi-agent shared inbox for customer support teams
- Contact import, segmentation, and CRM pipeline
- Analytics: delivery rates, read rates, reply rates, campaign ROI

**Who it's for:** Indian SMBs in retail, real estate, education, healthcare, e-commerce, and any business where customers already communicate on WhatsApp.

**Pricing context:** Meta charges per conversation (a 24-hour window). In India: approximately ₹0.25–0.85 per conversation depending on template category. Our platform subscription is separate.

**Timeline:** Most clients send their first broadcast within 4–5 weeks of kickoff (includes Meta verification, which takes 1–2 weeks).

**FAQs:**
Q: How do I get started with WhatsApp Business API in India?
A: We handle the entire process — Meta Business Manager verification, WhatsApp Business Account creation, phone number registration, and webhook configuration. You don't need a technical team. Most businesses are live within 2–3 weeks.

Q: What is the difference between WhatsApp Business App and WhatsApp Business API?
A: The WhatsApp Business App is a free mobile app for small businesses — it supports 1 device, manual replies only, and no bulk messaging. The WhatsApp Business API is a paid, developer-accessible interface that supports automation, bulk broadcasts, multiple agents, and CRM integration.

Q: How much does WhatsApp Business API cost in India?
A: Meta charges per conversation (a 24-hour messaging window), not per message. In India: marketing templates cost approximately ₹0.85/conversation, utility templates ₹0.25/conversation, and authentication templates ₹0.15/conversation (rates as of 2025). There is no monthly fee from Meta — you pay only for conversations initiated.

Q: Is WhatsApp marketing legal in India?
A: Yes, provided contacts have opted in to receive messages. WhatsApp requires explicit opt-in before you can send marketing messages. All message templates must be approved by Meta before use. We help you build compliant opt-in flows.

Q: How many messages can I send per day on WhatsApp API?
A: WhatsApp uses a messaging tier system. New numbers start at 250 conversations/day and scale to 1,000 → 10,000 → 100,000/day based on volume and quality rating. We help you scale tiers by maintaining high message quality scores.

---

## Service 2: Web Development & Design

**URL:** https://conveys.in/services/web-development

**What it is:** Custom website and web application development using modern frameworks. We build marketing websites, web apps, e-commerce stores, client portals, and internal tools.

**What we deliver:**
- Marketing websites (Next.js, Tailwind CSS)
- Web applications with authentication, dashboards, and data management
- E-commerce stores (custom or Shopify/WooCommerce)
- Client and vendor portals
- API development and third-party integrations
- Performance optimisation and Core Web Vitals improvement
- Ongoing maintenance and hosting management

**Tech stack:** Next.js 15, React, TypeScript, Tailwind CSS, Node.js, Fastify, PostgreSQL, Prisma, Vercel, AWS.

**Pricing context:** A professional marketing website starts at ₹25,000. A custom web application with authentication, dashboards, and integrations typically ranges from ₹75,000–₹3,00,000 depending on complexity.

**Timeline:** A marketing website typically takes 2–4 weeks. A full web application takes 6–16 weeks.

**FAQs:**
Q: How much does a website cost in India?
A: A professional 5–10 page marketing website built in Next.js starts at ₹25,000. An e-commerce website starts at ₹50,000. A custom web application with user authentication, admin panel, and API integrations typically costs ₹75,000–₹3,00,000 depending on the number of features.

Q: How long does it take to build a website?
A: A marketing website takes 2–4 weeks from design approval to launch. An e-commerce store takes 4–8 weeks. A custom web application with multiple user roles and integrations takes 8–16 weeks.

Q: Should I choose WordPress or custom development?
A: WordPress suits simple blogs and brochure sites where you want easy content management. Custom development (Next.js/React) is better for performance-critical sites, web applications, SaaS products, or any site that needs custom integrations. Custom sites load faster, rank better on Core Web Vitals, and are easier to scale.

Q: Do you provide website maintenance after launch?
A: Yes. We offer monthly maintenance packages covering security updates, plugin/dependency updates, performance monitoring, uptime checks, and content updates. Pricing starts at ₹3,000/month.

Q: What technologies do you use for web development?
A: Next.js 15 (React framework) for the frontend, Node.js with Fastify for backends, PostgreSQL for databases, Prisma as ORM, Tailwind CSS for styling, and Vercel or Railway for deployment. All code is TypeScript with strict type checking.

---

## Service 3: Mobile App Development

**URL:** https://conveys.in/services/mobile-app-development

**What it is:** iOS and Android app development, both native and cross-platform. We cover the full lifecycle: UX design, development, QA, and App Store/Google Play submission.

**What we deliver:**
- Cross-platform apps (React Native) — one codebase for iOS + Android
- Native iOS apps (Swift) and native Android apps (Kotlin) for performance-critical use cases
- UX/UI design for mobile (Figma prototypes before development)
- Backend APIs for mobile apps
- Push notifications, offline support, device sensors, payment integrations
- App Store and Google Play submission and review management
- Post-launch updates and feature development

**Pricing context:** A cross-platform MVP app starts at ₹1,50,000. A full-featured app with backend, authentication, and payment integration typically costs ₹3,00,000–₹10,00,000.

**Timeline:** An MVP cross-platform app takes 8–12 weeks. A full-featured app takes 16–24 weeks.

**FAQs:**
Q: Should I build an iOS app, Android app, or both?
A: In India, Android has approximately 95% market share. If budget is constrained, start with Android. If your target audience is urban professionals or enterprise users, iOS matters more. Cross-platform development (React Native) lets you target both with one codebase at 60–70% of the cost of building two native apps.

Q: How much does it cost to build a mobile app in India?
A: A cross-platform MVP app (login, core feature, basic UI) starts at ₹1,50,000. A full-featured app with backend, notifications, payments, and admin panel typically costs ₹3,00,000–₹10,00,000. Native iOS-only or Android-only apps cost slightly less than cross-platform for a single platform.

Q: How long does app development take?
A: An MVP cross-platform app takes 8–12 weeks. A full-featured app with complex backend integration takes 16–24 weeks. We always begin with a 2-week UX design phase before writing any code.

Q: What is the difference between React Native and Flutter?
A: Both are cross-platform frameworks. React Native (JavaScript/TypeScript) has a larger ecosystem and shares code with web React projects. Flutter (Dart) produces near-native performance and pixel-perfect UI. We primarily use React Native because it integrates well with our web tech stack and has better library support for Indian payment gateways.

Q: Do you handle App Store and Google Play submission?
A: Yes. We manage the full submission process including app signing, metadata, screenshots, and responding to Apple or Google review feedback. First-time submissions typically take 1–3 days for Google Play and 1–7 days for the Apple App Store.

---

## Service 4: AI Solutions & LLM Integration

**URL:** https://conveys.in/services/ai-solutions

**What it is:** Practical AI integration for business operations — not experimental prototypes, but production systems that automate real work. We integrate large language models (Claude, GPT-4) into your existing workflows.

**What we deliver:**
- Custom AI chatbots for customer support, lead qualification, and FAQ answering
- RAG (Retrieval-Augmented Generation) systems — AI that answers questions from your own documents, PDFs, and databases
- Document processing automation — extract structured data from invoices, contracts, forms
- AI-powered reporting — natural language queries against your business data
- WhatsApp + AI integration — AI chatbot on your WhatsApp Business number
- LLM fine-tuning and prompt engineering for domain-specific accuracy
- Voice AI (speech-to-text + AI responses via ElevenLabs)

**Pricing context:** A simple AI chatbot integration starts at ₹50,000. A full RAG system with document ingestion pipeline and custom UI costs ₹1,50,000–₹5,00,000.

**FAQs:**
Q: Which AI model should I use — Claude or GPT-4?
A: Both are excellent. Anthropic Claude is superior for document analysis, long-context tasks, and following precise instructions. OpenAI GPT-4 has a wider plugin/tool ecosystem. We recommend Claude (via Anthropic API) for most Indian business use cases due to its accuracy with complex instructions and cost efficiency.

Q: What is RAG and why does my business need it?
A: RAG (Retrieval-Augmented Generation) connects an AI model to your specific documents and data. Instead of relying on the AI's training data, it searches your product manuals, policies, or database before answering. This means accurate, up-to-date answers grounded in your actual business information — not generic AI responses.

Q: How much does AI integration cost for a small business in India?
A: A simple AI chatbot added to your website or WhatsApp starts at ₹50,000. A RAG system that can answer questions from your document library costs ₹1,50,000–₹3,00,000. Ongoing API costs (Anthropic/OpenAI) are separate and typically ₹2,000–₹20,000/month depending on usage volume.

Q: Can AI replace my customer support team?
A: AI works best as a first-response layer that handles 60–80% of repetitive queries automatically, escalating complex issues to human agents. It doesn't replace your team — it makes them more efficient by eliminating routine FAQ handling.

Q: How long does it take to build an AI solution?
A: A simple chatbot integration takes 2–3 weeks. A full RAG pipeline with document ingestion, vector search, and a custom UI takes 6–10 weeks. WhatsApp + AI integration (connecting the AI to your WhatsApp Business API) takes 3–4 weeks.

---

## Service 5: SaaS & MVP Development

**URL:** https://conveys.in/services/saas-product-development

**What it is:** Full-stack SaaS product development from idea to production — multi-tenant architecture, subscription billing, user management, and all the infrastructure a commercial software product needs.

**What we deliver:**
- Product definition and technical architecture
- UX/UI design (Figma)
- Multi-tenant backend (shared database with row-level security, or separate schemas)
- Authentication (social login, email/password, 2FA)
- Subscription billing (Stripe or Razorpay integration)
- Admin panel and analytics dashboard
- API development for third-party integrations
- DevOps: CI/CD pipeline, staging + production environments, monitoring

**Pricing context:** An MVP SaaS product (core features, billing, auth) starts at ₹3,00,000. A fully-featured SaaS with advanced reporting, integrations, and mobile app typically costs ₹8,00,000–₹25,00,000.

**FAQs:**
Q: How much does it cost to build a SaaS product in India?
A: An MVP SaaS with core features, user authentication, and Stripe billing starts at ₹3,00,000. A production-ready SaaS with multi-tenancy, admin panel, analytics, and API integrations costs ₹8,00,000–₹25,00,000. The exact cost depends on the number of features, integrations, and whether you need a mobile app alongside the web product.

Q: How long does SaaS development take?
A: An MVP takes 12–16 weeks (3–4 months) from kickoff to launch. A full SaaS product takes 6–12 months. We recommend launching an MVP with 3–5 core features first, then iterating based on real user feedback.

Q: What is the difference between MVP and full product development?
A: An MVP (Minimum Viable Product) includes only the core features needed to validate your idea with real users. Full product development adds secondary features, integrations, mobile apps, and enterprise capabilities. We always recommend starting with an MVP to avoid building features nobody uses.

Q: Do you build multi-tenant SaaS?
A: Yes. We build shared-database multi-tenant architecture using PostgreSQL with row-level security (RLS). Each tenant's data is logically isolated at the database level. This is more cost-efficient than per-tenant database architectures and scales well to thousands of tenants.

Q: Can you help with product strategy, not just development?
A: Yes. Before writing code, we run a 2-week discovery phase covering user research, competitor analysis, feature prioritisation, and technical architecture. We help you decide what to build first, not just how to build it.

---

## Service 6: Digital Marketing

**URL:** https://conveys.in/services/digital-marketing

**What it is:** SEO, WhatsApp marketing, and performance campaigns for Indian businesses. We focus on channels that drive measurable leads — not vanity metrics.

**What we deliver:**
- SEO (on-page, technical, local SEO for Google Business Profile)
- WhatsApp broadcast campaigns (using WhatsApp Business API)
- Google Ads and Meta Ads management
- Content marketing and blog writing
- Analytics setup (GA4, Google Search Console)
- Conversion rate optimisation

**FAQs:**
Q: How long does SEO take to show results in India?
A: For a new website, expect 4–6 months before meaningful organic traffic. For an established site with existing content, improvements can show within 6–8 weeks. The timeline depends heavily on domain age, backlink profile, and competition in your niche.

Q: Is WhatsApp marketing effective for Indian businesses?
A: Yes — WhatsApp has 500+ million users in India with open rates of 95%+ compared to 20–25% for email. Bulk WhatsApp campaigns (via the Business API) consistently outperform email for lead nurturing, cart recovery, and event notifications in Indian markets.

Q: What is the difference between WhatsApp Business App and WhatsApp API for marketing?
A: The WhatsApp Business App is free but limited — you can only message manually, one conversation at a time, from one device. The WhatsApp Business API supports bulk broadcasts to thousands of opted-in contacts, automation, segmentation, and analytics.

Q: How much does WhatsApp marketing cost per message in India?
A: Meta charges per conversation (24-hour window), not per message. Marketing template conversations in India cost approximately ₹0.85 each. A campaign to 1,000 contacts costs approximately ₹850 in Meta fees, plus your platform subscription.

Q: Do you manage Google Ads for Indian businesses?
A: Yes. We manage Google Search, Display, and Performance Max campaigns. Our minimum recommended monthly ad spend is ₹20,000. We charge a management fee of 15–20% of ad spend. We set up conversion tracking in GA4 so you can see cost-per-lead for every campaign.
```

- [ ] **Step 3: Verify both files are accessible**

Run the dev server and confirm:
```bash
pnpm --filter @WBMSG/conveys dev
```
Then visit:
- `http://localhost:3001/llms.txt` — should return plain text
- `http://localhost:3001/llms-full.txt` — should return plain text

- [ ] **Step 4: Commit**

```bash
git add apps/conveys/public/llms.txt apps/conveys/public/llms-full.txt
git commit -m "feat(conveys): add llms.txt and llms-full.txt for AI crawler discoverability"
```

---

## Task 2: Enhance layout.tsx (Bing meta tag + knowsAbout schema)

**Files:**
- Modify: `apps/conveys/app/layout.tsx`

- [ ] **Step 1: Add Bing verification meta tag + knowsAbout to Organization schema**

In `apps/conveys/app/layout.tsx`, make two changes:

**Change 1** — add `knowsAbout` to the Organization entity inside `jsonLd` (after the `sameAs` field):

Find:
```typescript
      sameAs: [],
    },
```

Replace with:
```typescript
      sameAs: [],
      knowsAbout: [
        "WhatsApp Business API",
        "Web Development",
        "Mobile App Development",
        "AI Solutions",
        "LLM Integration",
        "SaaS Development",
        "Digital Marketing",
        "React",
        "Next.js",
        "Node.js",
        "React Native",
      ],
    },
```

**Change 2** — add Bing verification meta tag inside `<head>` (after the existing JSON-LD script):

Find:
```tsx
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
```

Replace with:
```tsx
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Replace BING_CODE below after verifying at bing.com/webmasters */}
        <meta name="msvalidate.01" content="BING_CODE_PLACEHOLDER" />
      </head>
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/layout.tsx
git commit -m "feat(conveys): add knowsAbout to Organization schema and Bing verification meta tag"
```

---

## Task 3: /about page

**Files:**
- Create: `apps/conveys/app/about/page.tsx`

- [ ] **Step 1: Create the about page**

Create `apps/conveys/app/about/page.tsx`:

```typescript
import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "About Conveys Information Technology — Mumbai",
  description:
    "Conveys Information Technology is a software development company in Dombivli West, Mumbai. We build web apps, mobile apps, WhatsApp CRM, AI solutions, and SaaS products for Indian businesses.",
  alternates: { canonical: "https://conveys.in/about" },
  openGraph: { url: "https://conveys.in/about" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": "https://conveys.in/about#page",
  url: "https://conveys.in/about",
  name: "About Conveys Information Technology",
  about: {
    "@type": "Organization",
    "@id": "https://conveys.in/#organization",
    name: "Conveys Information Technology",
    foundingDate: "2022",
    url: "https://conveys.in",
    email: "info@conveys.in",
    telephone: "+919907072035",
    address: {
      "@type": "PostalAddress",
      streetAddress: "SwaminarayanCity",
      addressLocality: "Dombivli West",
      addressRegion: "Maharashtra",
      postalCode: "421202",
      addressCountry: "IN",
    },
    areaServed: { "@type": "Country", name: "India" },
    knowsAbout: [
      "WhatsApp Business API",
      "Web Development",
      "Mobile App Development",
      "AI Solutions",
      "LLM Integration",
      "SaaS Development",
      "Digital Marketing",
      "React",
      "Next.js",
      "Node.js",
      "React Native",
      "PostgreSQL",
      "TypeScript",
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Software Development Services",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "WhatsApp CRM & Business API", url: "https://conveys.in/services/whatsapp-crm" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Web Development & Design", url: "https://conveys.in/services/web-development" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mobile App Development", url: "https://conveys.in/services/mobile-app-development" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "AI Solutions & LLM Integration", url: "https://conveys.in/services/ai-solutions" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "SaaS & MVP Development", url: "https://conveys.in/services/saas-product-development" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Digital Marketing", url: "https://conveys.in/services/digital-marketing" } },
      ],
    },
  },
};

const SERVICES = [
  { title: "WhatsApp CRM & Business API", href: "/services/whatsapp-crm", description: "End-to-end WhatsApp API setup, broadcasts, chatbots, and multi-agent inbox." },
  { title: "Web Development & Design", href: "/services/web-development", description: "Marketing sites, web apps, e-commerce, and portals in Next.js + Node.js." },
  { title: "Mobile App Development", href: "/services/mobile-app-development", description: "iOS, Android, and cross-platform apps with React Native." },
  { title: "AI Solutions & LLM Integration", href: "/services/ai-solutions", description: "AI chatbots, RAG systems, document processing, and LLM-powered workflows." },
  { title: "SaaS & MVP Development", href: "/services/saas-product-development", description: "Full-stack SaaS products with multi-tenancy, billing, and admin dashboards." },
  { title: "Digital Marketing", href: "/services/digital-marketing", description: "SEO, WhatsApp campaigns, Google Ads, and content marketing for Indian SMBs." },
] as const;

const TECH = [
  "Next.js 15", "React", "TypeScript", "Node.js", "Fastify",
  "PostgreSQL", "Prisma", "Redis", "React Native", "Flutter",
  "Anthropic Claude API", "OpenAI GPT-4", "WhatsApp Cloud API",
  "Stripe", "Razorpay", "Vercel", "Railway", "AWS S3",
] as const;

export default function AboutPage(): JSX.Element {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ConveysHeader />

      <main id="main-content">
        {/* Hero */}
        <section className="bg-slate-900 py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-sky-400">About Us</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Building Technology for Indian Businesses
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Conveys Information Technology is a software development company based in Dombivli West, Mumbai. We build custom web applications, mobile apps, WhatsApp CRM systems, AI-powered tools, and SaaS products for Indian SMBs and startups.
            </p>
          </div>
        </section>

        {/* Who We Are */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Who We Are</h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
              <p>
                We are a full-stack software development team specialising in the technology stacks most relevant to Indian businesses in 2025 — WhatsApp Business API, modern web frameworks (Next.js, React), cross-platform mobile development (React Native), and AI/LLM integration.
              </p>
              <p>
                Our clients are typically Indian SMBs, funded startups, and businesses that have outgrown off-the-shelf tools and need custom software built precisely for their workflows. We work across industries — retail, real estate, education, healthcare, fintech, and e-commerce.
              </p>
              <p>
                We are based in Dombivli West, Mumbai, Maharashtra (421202), and serve clients remotely across India and internationally.
              </p>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">What We Build</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <Link
                  key={s.title}
                  href={s.href}
                  className="group rounded-xl border border-slate-200 bg-white p-6 transition hover:border-indigo-200 hover:shadow-md"
                >
                  <h3 className="font-bold text-slate-900 group-hover:text-indigo-700">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Technology We Use</h2>
            <p className="mt-3 text-slate-500">
              We use modern, production-proven technologies. No outdated stacks, no framework experiments.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {TECH.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Why Conveys */}
        <section className="bg-indigo-600 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-white">Why Businesses Choose Us</h2>
            <ul className="mt-6 space-y-3">
              {[
                "India-focused — we understand Indian business workflows, payment systems (Razorpay, UPI), and regulatory context",
                "WhatsApp-first — WhatsApp is India's primary business communication channel, and it's our speciality",
                "Full-stack in-house team — no outsourcing, no freelancers; the same team that builds also maintains",
                "Fixed pricing — no hourly billing surprises; every project has a defined scope and price",
                "Modern tech stack — Next.js, TypeScript, PostgreSQL, React Native; no legacy PHP or jQuery",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-indigo-100">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold text-slate-900">Get in Touch</h2>
            <p className="mt-3 text-slate-500">Tell us what you&apos;re building. We&apos;ll respond within 24 hours.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-indigo-600 px-7 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
                Contact Us →
              </Link>
              <Link href="/" className="inline-flex items-center rounded-full border border-slate-200 px-7 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                ← Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <ConveysFooter />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/about/page.tsx
git commit -m "feat(conveys): add /about page with AboutPage + Organization JSON-LD"
```

---

## Task 4: Blog data file with 6 posts

**Files:**
- Create: `apps/conveys/app/blog/data/posts.ts`

- [ ] **Step 1: Create the posts data file**

First create the directory, then create `apps/conveys/app/blog/data/posts.ts`:

```typescript
export interface BlogSection {
  type: "h2" | "h3" | "p" | "ul"
  text?: string
  items?: string[]
}

export interface BlogFaq {
  question: string
  answer: string
}

export interface BlogPost {
  slug: string
  title: string
  description: string
  publishedAt: string
  category: string
  readingTime: string
  intro: string
  sections: BlogSection[]
  faqs: BlogFaq[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "whatsapp-business-api-india-guide",
    title: "WhatsApp Business API: Complete Guide for Indian Businesses (2025)",
    description:
      "Everything Indian businesses need to know about WhatsApp Business API — how it works, cost, approval process, and how it differs from the WhatsApp Business App.",
    publishedAt: "2026-05-10",
    category: "WhatsApp CRM",
    readingTime: "8 min read",
    intro:
      "WhatsApp has over 500 million active users in India — more than any other country. For Indian businesses, it has become the primary channel for customer communication, replacing phone calls and SMS. WhatsApp Business API takes this a step further, turning WhatsApp into a fully automated, scalable business platform. Here is everything you need to know.",
    sections: [
      { type: "h2", text: "What Is WhatsApp Business API?" },
      { type: "p", text: "WhatsApp Business API (now officially called WhatsApp Cloud API) is a developer-accessible interface that allows businesses to send and receive WhatsApp messages programmatically. Unlike the free WhatsApp Business App — which is a mobile app you install on your phone — the API connects to your CRM, website, or custom software to automate conversations at scale." },
      { type: "p", text: "Meta (which owns WhatsApp) provides the API. You access it either directly through Meta's Cloud API or through a Business Solution Provider (BSP). The API supports text, images, documents, videos, interactive buttons, and list messages." },
      { type: "h2", text: "WhatsApp Business App vs WhatsApp Business API — Key Differences" },
      { type: "ul", items: [
        "Business App: Free, mobile-only, manual replies, 1 device, no bulk messaging, no automation",
        "Business API: Paid (Meta charges per conversation), multi-device, supports automation and chatbots, supports bulk broadcasts, integrates with CRMs",
        "Business App: Limited to 256 contacts in broadcast lists, and recipients must have saved your number",
        "Business API: Broadcast to unlimited opted-in contacts without them saving your number",
        "Business App: No analytics beyond basic message counts",
        "Business API: Full analytics — delivery rates, read rates, reply rates, campaign ROI",
      ]},
      { type: "h2", text: "How Much Does WhatsApp Business API Cost in India?" },
      { type: "p", text: "Meta does not charge a monthly subscription fee. Instead, they charge per conversation — a 24-hour messaging window that starts when the first message in an exchange is delivered. Rates in India as of 2025:" },
      { type: "ul", items: [
        "Marketing conversations: ₹0.85 per conversation (promotional messages, offers, campaigns)",
        "Utility conversations: ₹0.25 per conversation (order updates, payment confirmations, appointment reminders)",
        "Authentication conversations: ₹0.15 per conversation (OTPs, verification codes)",
        "Service conversations: ₹0.00 per conversation (customer-initiated messages, free within 24-hour window)",
        "First 1,000 conversations per month are free (service conversations only)",
      ]},
      { type: "p", text: "In addition to Meta's fees, you pay for the platform or software that connects to the API — either a third-party tool or a custom-built system. These typically range from ₹2,000–₹15,000/month depending on features and contact volume." },
      { type: "h2", text: "How to Get WhatsApp Business API Approval in India" },
      { type: "p", text: "The approval process involves Meta verifying that your business is legitimate. Here are the steps:" },
      { type: "ul", items: [
        "Step 1: Create a Meta Business Manager account at business.facebook.com",
        "Step 2: Verify your business — upload GST certificate, PAN card, or other business registration documents",
        "Step 3: Create a WhatsApp Business Account (WABA) within Business Manager",
        "Step 4: Register a phone number (must be a number not already on WhatsApp)",
        "Step 5: Submit message templates for Meta approval (marketing templates: 24–48 hours; utility templates: a few minutes)",
        "Step 6: Configure webhooks to receive incoming messages",
      ]},
      { type: "p", text: "The entire process typically takes 1–3 weeks. The longest part is Meta's business verification, which can take 5–10 business days if your business information doesn't match Meta's third-party verification sources." },
      { type: "h2", text: "Who Should Use WhatsApp Business API?" },
      { type: "ul", items: [
        "E-commerce businesses sending order confirmations, shipping updates, and delivery notifications",
        "Real estate companies sending property listings and following up with leads",
        "Education institutes sending admission updates, fee reminders, and class schedules",
        "Healthcare providers sending appointment reminders and lab result notifications",
        "Financial services sending loan status updates and payment reminders",
        "Any business running promotional campaigns that want higher open rates than email (WhatsApp: 95% vs Email: 20%)",
        "Businesses with customer support teams that need a shared inbox for managing conversations",
      ]},
      { type: "h2", text: "Common Use Cases for Indian Businesses" },
      { type: "ul", items: [
        "Lead qualification chatbot: automatically collect name, city, budget from incoming WhatsApp enquiries",
        "Bulk promotional broadcasts: send offers to your entire opted-in customer database",
        "Order and delivery updates: real-time status notifications for e-commerce",
        "Appointment booking: customers book appointments via WhatsApp chatbot, no phone call needed",
        "Payment collection: send payment links via WhatsApp with automatic follow-up reminders",
        "Customer support: shared inbox where multiple agents handle WhatsApp conversations",
      ]},
    ],
    faqs: [
      { question: "How is WhatsApp Business API different from the regular WhatsApp Business App?", answer: "The WhatsApp Business App is a free mobile app for small businesses — it supports manual replies only, one device, and broadcast lists limited to 256 contacts who must have your number saved. The WhatsApp Business API is a developer interface that supports automation, unlimited broadcasts to opted-in contacts, multiple agents, CRM integration, and detailed analytics. The API requires a registered business and Meta approval." },
      { question: "How long does WhatsApp Business API approval take in India?", answer: "The full process typically takes 1–3 weeks. Meta's business verification takes 5–10 business days. Phone number registration is instant. Message template approval takes 24–48 hours for marketing templates and a few minutes for utility templates. Having your GST certificate, company PAN, and a verified business address ready speeds up the process." },
      { question: "Can I use my existing phone number for WhatsApp Business API?", answer: "You can port a number, but it must first be removed from any existing WhatsApp account (personal or Business App). The number cannot be actively used on WhatsApp while you register it for the API. Most businesses use a dedicated landline or a new mobile number for the API to avoid disrupting existing WhatsApp conversations." },
      { question: "What happens if WhatsApp bans my number?", answer: "WhatsApp can suspend numbers that violate their Business Messaging Policy — typically from sending messages to contacts who haven't opted in, using spammy content, or exceeding message frequency limits. To avoid this: always collect explicit opt-in, use Meta-approved templates, maintain a high Quality Rating in your WhatsApp Manager dashboard, and honour opt-out requests immediately." },
      { question: "Do customers need to save my number to receive WhatsApp broadcasts?", answer: "No — unlike the WhatsApp Business App broadcast feature (which requires contacts to save your number), the WhatsApp Business API can send messages to any opted-in number without them saving your contact. However, contacts must have explicitly opted in to receive messages from your business. Opt-in can be collected via your website, offline forms, or other channels." },
    ],
  },

  {
    slug: "web-development-company-india-how-to-choose",
    title: "How to Choose a Web Development Company in India (2025 Guide)",
    description:
      "A practical guide for Indian businesses evaluating web development agencies — what to check, what to avoid, realistic pricing, and the right questions to ask before signing.",
    publishedAt: "2026-05-12",
    category: "Web Development",
    readingTime: "7 min read",
    intro:
      "India has tens of thousands of web development agencies — from solo freelancers to 500-person studios. Prices range from ₹5,000 to ₹50,00,000 for ostensibly similar work. Choosing the wrong partner wastes months and money. This guide gives you a systematic way to evaluate your options.",
    sections: [
      { type: "h2", text: "What Does a Web Development Company Actually Deliver?" },
      { type: "p", text: "Before evaluating vendors, be clear on what you need. A 'website' could mean a 5-page brochure site, a 50-page e-commerce store, a customer portal with login and dashboards, or a fully custom web application. The scope determines the right type of partner — a freelancer suits a brochure site; a full-stack agency is necessary for a web application." },
      { type: "h2", text: "6 Questions to Ask Every Agency You Evaluate" },
      { type: "ul", items: [
        "What tech stack do you use, and why? (Red flag: 'Whatever the client wants' — good agencies have opinions)",
        "Can I see 3 recent live websites you've built in a similar category to mine?",
        "Who will actually build my project — senior developers or freshers supervised by seniors?",
        "What does your handoff look like — do I own the code, hosting, and domain? Or am I locked into your platform?",
        "What happens after launch — do you offer a maintenance retainer, and what does it include?",
        "How do you handle scope changes mid-project?",
      ]},
      { type: "h2", text: "Tech Stack Red Flags" },
      { type: "ul", items: [
        "WordPress for everything: WordPress suits content-heavy sites but is a poor choice for web applications or anything with complex business logic",
        "Wix / Squarespace for 'custom' work: page builders produce sites you can't customise beyond their templates",
        "PHP without a framework: unmaintained, inconsistent code that is expensive to modify later",
        "No mention of TypeScript or type safety: modern JavaScript projects should use TypeScript to catch bugs before they ship",
        "No CI/CD or staging environment: agencies that deploy directly to production have no quality control",
      ]},
      { type: "h2", text: "Realistic Web Development Pricing in India (2025)" },
      { type: "ul", items: [
        "Freelancer (5-page brochure site, WordPress): ₹8,000–₹25,000",
        "Agency (professional marketing site, Next.js, custom design): ₹25,000–₹80,000",
        "Agency (e-commerce store, up to 100 products, Shopify or custom): ₹50,000–₹1,50,000",
        "Agency (web application, auth, dashboards, API integrations): ₹75,000–₹3,00,000",
        "Agency (SaaS product, multi-tenancy, billing, admin panel): ₹3,00,000–₹15,00,000",
        "Enterprise / complex platform: ₹15,00,000+",
      ]},
      { type: "p", text: "Quotes significantly below these ranges almost always mean one of: offshore sub-contracting (you don't know who's building it), template reselling (not custom work), or under-scoping (they'll charge extra for everything beyond the basic)." },
      { type: "h2", text: "Ownership — The Most Important Clause in Your Contract" },
      { type: "p", text: "Before signing anything, confirm in writing: you own 100% of the source code, you control the hosting account and domain registrar, and there are no proprietary frameworks or tools that lock you in. Some agencies build on their own CMS platforms — if you leave, you lose your website. Always insist on Git access to your own repository from day one." },
      { type: "h2", text: "How to Verify an Agency's Claims" },
      { type: "ul", items: [
        "Visit the live websites in their portfolio — check load speed in Google PageSpeed Insights",
        "Inspect the tech stack: right-click → View Page Source to see what framework they used",
        "Check the Wayback Machine (web.archive.org) to see if portfolio sites actually launched recently or years ago",
        "Ask for a 15-minute call with the developer who will build your project, not just the sales person",
        "Search the company name + 'review' on Google, Glassdoor (see how they treat employees), and Clutch",
      ]},
    ],
    faqs: [
      { question: "Should I hire a freelancer or a web development agency in India?", answer: "For a simple brochure website under ₹30,000, a freelancer can work well — lower overhead means better value. For anything requiring multiple technologies (frontend + backend + database), ongoing maintenance, or business-critical reliability, an agency is safer. Agencies have teams, so your project doesn't stop when one person gets sick or leaves." },
      { question: "How do I know if a web development quote is fair?", answer: "Compare at least 3 quotes for the same specification. Extremely low quotes (50%+ below market) usually mean outsourcing, templates, or under-scoping. Ask every agency to itemise what's included — hours for design, development, testing, QA, revisions, and launch support. The itemisation reveals whether they've actually thought through your project." },
      { question: "What should I own after a website is built?", answer: "You should own: the source code (in a Git repository under your account), the domain name (registered in your name, not the agency's), the hosting account (or the ability to transfer the site to your own host), all images and content, and the design files (Figma or similar). Never accept an arrangement where the agency 'hosts your site' without giving you access to the underlying server or account." },
      { question: "How long should website development take?", answer: "A professional 10-page marketing website: 3–5 weeks. An e-commerce store: 6–10 weeks. A custom web application: 10–20 weeks. Be wary of agencies that quote significantly faster timelines — rushed development means skipped testing, poor code quality, and bugs in production." },
      { question: "What is the difference between a website and a web application?", answer: "A website is primarily informational — visitors read content, contact you, or browse products. A web application has user accounts, data that changes per user, business logic, and integrations. Examples: a portfolio site is a website; a customer portal where clients log in to view their orders is a web application. Web applications are significantly more complex and expensive to build." },
    ],
  },

  {
    slug: "ios-android-cross-platform-india-startups",
    title: "iOS vs Android vs Cross-Platform: What Indian Startups Should Build First",
    description:
      "A practical breakdown of iOS, Android, and cross-platform development for Indian startups — cost, timeline, when to choose each, and why most Indian businesses should start with Android.",
    publishedAt: "2026-05-14",
    category: "Mobile App Development",
    readingTime: "6 min read",
    intro:
      "One of the first decisions in mobile app development is platform: iOS, Android, or both via cross-platform frameworks like React Native or Flutter. For Indian startups, this decision has a clear answer in most cases — but understanding why helps you make the right call for your specific situation.",
    sections: [
      { type: "h2", text: "India's Mobile Market: The Data That Shapes the Decision" },
      { type: "ul", items: [
        "Android holds approximately 95% smartphone market share in India (StatCounter, 2025)",
        "iOS has 4–5% market share but accounts for a higher share of urban, high-income users",
        "Average Indian smartphone is mid-range Android (₹10,000–₹25,000 range)",
        "App Store (iOS) generates significantly higher average revenue per user globally — but not necessarily in India",
        "If your target market is tier-1 cities, working professionals, or B2B enterprise: iOS matters more",
        "If your target market is mass-market consumers, tier-2/3 cities, or SMBs: Android-first is correct",
      ]},
      { type: "h2", text: "Native Android Development" },
      { type: "p", text: "Native Android apps are built in Kotlin (modern) or Java (legacy). They have direct access to all Android APIs, optimal performance, and the best integration with Android-specific features like widgets, shortcuts, and deep system notifications." },
      { type: "ul", items: [
        "Best for: apps requiring maximum performance, hardware-intensive features, or deep Android system integration",
        "Cost: ₹1,50,000–₹5,00,000 for a full-featured app",
        "Timeline: 12–20 weeks",
        "Con: you get Android only — separate project needed for iOS",
      ]},
      { type: "h2", text: "Native iOS Development" },
      { type: "p", text: "Native iOS apps are built in Swift. Apple's ecosystem has strict guidelines, a more controlled App Store review process, and users who statistically spend more per app than Android users globally." },
      { type: "ul", items: [
        "Best for: premium apps targeting urban Indian professionals, fintech apps targeting iPhone users, apps where Apple's security model is a feature",
        "Cost: ₹1,50,000–₹5,00,000 for a full-featured app",
        "Timeline: 12–20 weeks",
        "Con: 4–5% of the Indian market; App Store review can take 1–7 days",
      ]},
      { type: "h2", text: "Cross-Platform: React Native and Flutter" },
      { type: "p", text: "Cross-platform frameworks let you write one codebase that runs on both iOS and Android. React Native uses JavaScript/TypeScript; Flutter uses Dart. Both have matured significantly and power many production apps." },
      { type: "ul", items: [
        "React Native: used by Facebook, Instagram, Shopify, and thousands of Indian startups; JavaScript ecosystem means web developers can contribute",
        "Flutter: better visual consistency across platforms, smoother animations, but smaller library ecosystem for Indian-specific integrations (Razorpay, etc.)",
        "Cross-platform cost advantage: 60–70% of the cost of building two native apps separately",
        "Cross-platform timeline: 10–16 weeks for a full-featured app",
        "Cross-platform limitation: 5–10% performance gap vs native for CPU-intensive tasks; some platform-specific UI patterns look slightly off",
      ]},
      { type: "h2", text: "Cost Comparison" },
      { type: "ul", items: [
        "Android only (native Kotlin): ₹1,50,000–₹5,00,000",
        "iOS only (native Swift): ₹1,50,000–₹5,00,000",
        "Both native (Android + iOS separately): ₹3,00,000–₹10,00,000",
        "Cross-platform React Native (both platforms): ₹2,00,000–₹6,00,000",
        "Add backend API (required for most apps): ₹1,00,000–₹3,00,000 additional",
      ]},
      { type: "h2", text: "Our Recommendation for Indian Startups" },
      { type: "p", text: "For most Indian consumer-facing startups: build cross-platform with React Native. You cover 100% of the market at 60–70% the cost of native, your TypeScript codebase is familiar to web developers you may already have, and libraries for Razorpay, UPI, and Indian payment gateways are well-supported. Start with Android as your primary test platform (where your users are), then verify on iOS before launch." },
      { type: "p", text: "The exception: if you're building a high-performance game, a camera-heavy app, or an AR/VR experience — native is worth the extra cost. For everything else — delivery apps, booking platforms, CRMs, fintech, edtech — React Native handles it well." },
    ],
    faqs: [
      { question: "Should an Indian startup build iOS or Android first?", answer: "Android first, in almost every case. With 95% market share in India, Android is where your users are. iOS matters if your specific target audience is urban, high-income professionals (fintech, B2B enterprise, premium consumer) — in which case cross-platform covers both. Building iOS-first for the Indian market is almost always the wrong call." },
      { question: "Is React Native good enough for a production app in India?", answer: "Yes. React Native powers Facebook, Instagram's early versions, Shopify, and thousands of production apps. Indian-specific integrations — Razorpay, PayU, UPI deep links, Aadhaar-based KYC — all have React Native libraries. The 5–10% performance gap vs native only matters for games or AR apps. For a B2B tool, delivery app, booking platform, or CRM, React Native is production-ready." },
      { question: "How long does App Store and Google Play approval take?", answer: "Google Play: typically 1–3 days for a new app (automated review for most apps). Apple App Store: 1–7 days; Apple has human reviewers who can reject for policy violations and require resubmission. Plan for a buffer of 2 weeks before your target launch date to handle any review issues." },
      { question: "What is the minimum viable mobile app I should launch with?", answer: "An MVP should have: authentication (sign up, login), the single core feature your app is built around, a working backend API, and basic analytics. Strip everything else. Real user feedback after launch is worth more than 3 extra months of building features users might not want. Most successful apps launched with a fraction of their current feature set." },
      { question: "Do I need a mobile app, or will a mobile-responsive website work?", answer: "A mobile-responsive website works for most content and e-commerce use cases. You need a native/cross-platform app when you require: push notifications, offline functionality, access to phone hardware (camera, GPS, sensors), or when your users will interact with your product daily (a habit-forming app needs the friction reduction of a home screen icon)." },
    ],
  },

  {
    slug: "ai-llm-integration-indian-business",
    title: "How to Integrate AI & LLMs Into Your Indian Business (Practical Guide)",
    description:
      "A practical guide to AI and LLM integration for Indian SMBs — what types of AI exist, real use cases, cost, and how to evaluate vendors. No hype, just actionable information.",
    publishedAt: "2026-05-16",
    category: "AI Solutions",
    readingTime: "7 min read",
    intro:
      "The AI conversation in India has moved past 'should we use AI?' to 'how do we actually implement it without wasting money?' Large language models (LLMs) like Anthropic Claude and OpenAI GPT-4 are now practical tools for business automation — but only if you implement them for the right problems. This guide cuts through the hype.",
    sections: [
      { type: "h2", text: "Types of AI Solutions for Businesses" },
      { type: "ul", items: [
        "AI Chatbots: answer customer questions automatically, qualify leads, handle tier-1 support on your website or WhatsApp",
        "RAG Systems (Retrieval-Augmented Generation): AI that searches your own documents, databases, or product catalogue before answering — gives you accurate, business-specific answers",
        "Document Processing: extract structured data from invoices, contracts, forms, or PDFs automatically",
        "AI-Powered Reporting: ask questions about your business data in plain English — 'What were our top 5 products in March?' — and get instant answers",
        "Voice AI: speech-to-text for call centres, with AI summarisation and categorisation of customer calls",
        "Content Generation: automated product descriptions, email drafts, support reply suggestions",
      ]},
      { type: "h2", text: "Real Use Cases for Indian SMBs" },
      { type: "ul", items: [
        "Real estate: WhatsApp chatbot qualifies incoming leads (budget, location, timeline) before handing off to an agent",
        "CA firm: RAG system lets clients ask questions about their ITR status by searching the firm's document database",
        "E-commerce: AI automatically categorises customer support tickets and suggests replies for agents",
        "Clinic / hospital: AI extracts patient information from uploaded documents and populates appointment forms",
        "EdTech: AI chatbot answers student questions about course content 24/7 without a support team",
        "Manufacturing: AI analyses production data and generates daily operational summaries in plain English",
      ]},
      { type: "h2", text: "Which AI Model Should You Use?" },
      { type: "p", text: "The two dominant options for Indian businesses are Anthropic Claude and OpenAI GPT-4. Both are available via API and are not subject to Indian data localisation regulations for most use cases (consult your legal team for sensitive personal data)." },
      { type: "ul", items: [
        "Anthropic Claude: superior for document analysis, long-context tasks (up to 200,000 tokens), following precise multi-step instructions, and avoiding hallucinations on specific facts — recommended for most Indian business use cases",
        "OpenAI GPT-4: wider plugin ecosystem, strong image analysis (GPT-4V), and more third-party integrations built around it",
        "Cost comparison: Claude API and GPT-4 API are similarly priced for most use cases; both charge per token (unit of text processed)",
        "Indian businesses do not need to build their own models — using Claude or GPT-4 via API is faster, cheaper, and more accurate than fine-tuning for most use cases",
      ]},
      { type: "h2", text: "Cost to Build AI Solutions in India" },
      { type: "ul", items: [
        "Simple AI chatbot (FAQ answering on website/WhatsApp): ₹50,000–₹1,00,000 one-time build cost",
        "RAG system (AI searches your document library): ₹1,50,000–₹3,00,000 build cost",
        "Document processing pipeline: ₹1,50,000–₹4,00,000 depending on document types and extraction complexity",
        "AI analytics dashboard: ₹2,00,000–₹5,00,000",
        "Ongoing API costs (Anthropic/OpenAI): ₹2,000–₹20,000/month depending on query volume",
        "Hosting for AI backend: ₹2,000–₹10,000/month",
      ]},
      { type: "h2", text: "How to Evaluate an AI Vendor in India" },
      { type: "ul", items: [
        "Ask for a live demo using your actual data — not a polished demo with their example data",
        "Ask what model they use under the hood — reputable vendors use Claude or GPT-4, not 'proprietary AI'",
        "Ask about accuracy: what is the hallucination rate on out-of-scope questions? A good RAG system should say 'I don't know' rather than making up an answer",
        "Ask who owns the data: does the vendor store your business documents on their servers? What are their data retention policies?",
        "Ask about the fallback: if AI confidence is low, does the system escalate to a human?",
      ]},
      { type: "h2", text: "Getting Started: 3 Steps" },
      { type: "ul", items: [
        "Step 1: Identify one repetitive, high-volume task in your business that currently requires human judgement — this is your first AI use case",
        "Step 2: Audit the data you have available — AI works best when it has high-quality, structured input (a clean document library, a well-maintained CRM, an organised spreadsheet)",
        "Step 3: Build a small proof-of-concept before committing to a full build — a 2-week prototype on real data will tell you whether AI actually improves accuracy and speed before you invest ₹3 lakh",
      ]},
    ],
    faqs: [
      { question: "What is the difference between AI chatbots and traditional chatbots?", answer: "Traditional chatbots (rule-based) follow decision trees — they match keywords to pre-written responses and fail on anything outside their scripts. AI chatbots use large language models to understand intent and context, handle variations in phrasing, and generate coherent responses. AI chatbots require no scripting for every possible question — they reason from a knowledge base or context you provide." },
      { question: "What is RAG and why is it better than just using ChatGPT?", answer: "RAG (Retrieval-Augmented Generation) connects an AI model to your specific documents and data. When a user asks a question, the system first searches your document library for relevant information, then passes that context to the AI to generate an answer. This means the AI answers from your actual business data — product catalogues, policies, past tickets — rather than from its general training data. Generic ChatGPT doesn't know anything about your business; a RAG system does." },
      { question: "Is it safe to send business data to Claude or ChatGPT?", answer: "For general business data (product information, public-facing policies, non-sensitive operational data): yes, it is generally safe. Anthropic and OpenAI have enterprise data agreements where your inputs are not used for model training by default. For sensitive data (personal health information, Aadhaar numbers, financial account details): consult your legal team about data processing agreements and whether on-premise or VPC-deployed models are required." },
      { question: "Can AI replace my customer support team?", answer: "AI works best as a first-response layer that automatically handles 60–80% of routine queries (FAQs, order status, policy questions) and escalates complex issues to human agents. It does not replace your team — it redirects their time to higher-value conversations that actually require human empathy and problem-solving. Most businesses that implement AI support see support team productivity increase rather than headcount decrease." },
      { question: "How do I know if an AI solution is accurate enough for my business?", answer: "Define an accuracy threshold before you start — for example, 'AI must correctly answer 90% of questions in our test set.' Create a test set of 50–100 real questions with known correct answers. Measure the AI's accuracy on this set before launch. Also test 'out-of-scope' questions to verify the system responds with 'I don't know' rather than hallucinating an answer. Any vendor unwilling to test against your real data is a red flag." },
    ],
  },

  {
    slug: "saas-product-development-india-cost-timeline",
    title: "Building a SaaS Product in India: Cost, Timeline & Tech Stack (2025)",
    description:
      "Everything founders and product teams in India need to know about building a SaaS product — realistic costs, phase-by-phase timelines, tech stack choices, and common mistakes.",
    publishedAt: "2026-05-18",
    category: "SaaS Development",
    readingTime: "8 min read",
    intro:
      "India is the world's second-largest SaaS market by user count and growing. Dozens of Indian SaaS companies have scaled to $1M+ ARR — Zoho, Freshworks, Chargebee started here. If you're building a SaaS product in India, you have access to world-class development talent at competitive prices. Here's a realistic picture of what it takes.",
    sections: [
      { type: "h2", text: "What Is SaaS Development?" },
      { type: "p", text: "SaaS (Software as a Service) is software delivered via the internet, typically on a subscription model. Unlike custom software built for one client, a SaaS product is designed to serve many clients (tenants) simultaneously from a shared infrastructure. This requires multi-tenancy, subscription billing, self-serve onboarding, and robust user management from day one." },
      { type: "h2", text: "Phase 1: Discovery & Product Definition (Weeks 1–3)" },
      { type: "p", text: "Before writing code, you need a clear product specification. Discovery covers:" },
      { type: "ul", items: [
        "User research: who are your target customers, what is their current workflow, what pain are you solving?",
        "Competitor analysis: what existing tools do customers use today, and why are they insufficient?",
        "Feature prioritisation: which 3–5 features constitute the MVP (minimum viable product)?",
        "Technical architecture: monolith vs microservices, multi-tenant strategy, hosting infrastructure",
        "Data model: what entities does your product manage, and how do they relate?",
        "Integration map: which third-party services must you connect to (payment, email, WhatsApp, etc.)?",
      ]},
      { type: "h2", text: "Phase 2: Design (Weeks 3–6)" },
      { type: "ul", items: [
        "UX wireframes: low-fidelity screens showing user flows before visual design",
        "UI design in Figma: high-fidelity screens with your brand, typography, and colour palette",
        "Prototype review: clickable prototype reviewed by 3–5 target users before development starts",
        "Design system: component library (buttons, forms, tables, modals) used consistently across the product",
      ]},
      { type: "h2", text: "Phase 3: Development (Weeks 6–20 for MVP)" },
      { type: "p", text: "A typical SaaS MVP development phase covers:" },
      { type: "ul", items: [
        "Authentication: email/password login, Google OAuth, organisation invitations, role-based permissions",
        "Core feature development: the primary reason customers will pay for your product",
        "Billing integration: Stripe (international) or Razorpay (India) for subscription management",
        "Admin panel: internal dashboard for your team to manage customers, view metrics, and debug issues",
        "API: REST or GraphQL API if your product needs to integrate with other tools",
        "DevOps: CI/CD pipeline, staging environment, error monitoring (Sentry), uptime monitoring",
      ]},
      { type: "h2", text: "Realistic Cost Breakdown for Indian SaaS Development" },
      { type: "ul", items: [
        "Discovery phase (3 weeks): ₹50,000–₹1,00,000",
        "Design phase (3 weeks, Figma): ₹75,000–₹1,50,000",
        "MVP development (12–16 weeks): ₹2,00,000–₹8,00,000",
        "Total MVP cost: ₹3,00,000–₹10,00,000",
        "Full SaaS product (post-MVP iteration, 6–12 months total): ₹8,00,000–₹25,00,000",
        "Ongoing maintenance and hosting: ₹15,000–₹50,000/month depending on infrastructure",
      ]},
      { type: "h2", text: "Recommended Tech Stack for Indian SaaS Products" },
      { type: "ul", items: [
        "Frontend: Next.js 15 (React) + TypeScript + Tailwind CSS",
        "Backend: Node.js + Fastify + TypeScript",
        "Database: PostgreSQL + Prisma ORM (row-level security for multi-tenancy)",
        "Authentication: Clerk or Auth.js",
        "Billing: Stripe (global) + Razorpay (Indian customers)",
        "Hosting: Vercel (frontend) + Railway (backend) — easiest for Indian founders, no AWS complexity",
        "Monitoring: Sentry (errors) + Datadog (performance)",
        "Email: Resend or Amazon SES",
      ]},
      { type: "h2", text: "Most Common SaaS Development Mistakes in India" },
      { type: "ul", items: [
        "Building too many features before validating: launch with 3 features, not 30",
        "Ignoring multi-tenancy from the start: retrofitting multi-tenancy into a single-tenant architecture is expensive",
        "No staging environment: testing in production breaks customer trust",
        "Skipping billing until late: payment integration is harder than it looks — build it in the MVP phase",
        "Not owning your code: some Indian agencies build on proprietary platforms — if you leave, you lose your product",
        "No error monitoring: you need Sentry or equivalent from day one to know when things break in production",
      ]},
    ],
    faqs: [
      { question: "How much does it cost to build a SaaS product in India?", answer: "An MVP SaaS with authentication, core features, and billing integration costs ₹3,00,000–₹10,00,000. A full product with multi-tenancy, analytics, mobile app, and advanced integrations costs ₹8,00,000–₹25,00,000. Ongoing maintenance is ₹15,000–₹50,000/month. These are development costs — marketing, customer acquisition, and server costs are separate." },
      { question: "How long does it take to build a SaaS product?", answer: "An MVP takes 3–4 months (12–16 weeks): 3 weeks discovery, 3 weeks design, 12–16 weeks development. A fully featured product takes 6–12 months. We strongly recommend launching an MVP at the 4-month mark to get real user feedback before investing more in features." },
      { question: "What is multi-tenancy and do I need it?", answer: "Multi-tenancy means multiple customers (tenants) share the same application and database infrastructure, with their data logically separated. You need it if you're building a SaaS product where multiple independent businesses will have separate accounts. The alternative — separate databases per customer — is operationally expensive at scale. Use shared PostgreSQL with row-level security (RLS) for most Indian SaaS use cases." },
      { question: "Should I use Stripe or Razorpay for a SaaS product targeting Indian customers?", answer: "Use both if you plan to serve international and Indian customers. Razorpay handles Indian payment methods natively — UPI, net banking, cards, EMI — and is required for UPI. Stripe handles international cards and is better for subscriptions. If you're India-only: Razorpay. If you're global: Stripe, with Razorpay added for Indian customers who prefer local payment methods." },
      { question: "Should I build a SaaS product on WordPress?", answer: "No. WordPress is a content management system — it is not designed for SaaS multi-tenancy, user authentication at scale, subscription billing, or complex business logic. Building a SaaS on WordPress requires so many plugins and workarounds that you end up with an unmaintainable system. Use a proper web framework (Next.js, Rails, Django) with a relational database." },
    ],
  },

  {
    slug: "whatsapp-marketing-vs-email-marketing-india",
    title: "WhatsApp Marketing vs Email Marketing for Indian SMBs: Which Works Better?",
    description:
      "A data-driven comparison of WhatsApp marketing and email marketing for Indian small businesses — open rates, costs, compliance, and which channel to use for which purpose.",
    publishedAt: "2026-05-20",
    category: "Digital Marketing",
    readingTime: "6 min read",
    intro:
      "Indian SMBs spent years building email lists that now get 20% open rates on a good day. Meanwhile, their customers open WhatsApp messages within 3 minutes. WhatsApp marketing via the Business API has changed the calculus of digital marketing for Indian businesses — but it's not a wholesale replacement for email. Here's how to think about both channels.",
    sections: [
      { type: "h2", text: "The Open Rate Gap Is Real" },
      { type: "ul", items: [
        "WhatsApp message open rate in India: 90–95% (industry average)",
        "Email open rate in India: 18–25% (varies by industry; e-commerce averages 15–20%)",
        "WhatsApp messages are typically opened within 3–5 minutes of delivery",
        "Email average time to open: 6–12 hours",
        "WhatsApp reply rate: 30–45% for well-targeted campaigns",
        "Email reply rate: 2–5%",
      ]},
      { type: "h2", text: "Cost Comparison" },
      { type: "ul", items: [
        "Email: ₹0.01–₹0.10 per email sent (Mailchimp, Brevo pricing); bulk email to 10,000 contacts costs ₹100–₹1,000",
        "WhatsApp marketing conversation: ₹0.85 per 24-hour conversation window in India (Meta pricing)",
        "WhatsApp campaign to 10,000 contacts: ₹8,500 in Meta fees alone",
        "Email wins on pure cost-per-reach for large lists",
        "WhatsApp wins on cost-per-response — 10x+ higher response rates justify the higher send cost for conversion-focused campaigns",
      ]},
      { type: "h2", text: "Where WhatsApp Wins" },
      { type: "ul", items: [
        "Lead follow-up: responding to a fresh enquiry on WhatsApp within 5 minutes dramatically increases conversion rates vs an email follow-up",
        "Cart abandonment: a WhatsApp message 1 hour after cart abandonment outperforms email cart recovery by 3–5x in Indian e-commerce",
        "Appointment reminders: patients/clients actually see WhatsApp reminders — email reminders go to spam",
        "Payment collection: a WhatsApp message with a UPI payment link gets paid faster than an emailed invoice",
        "Event notifications: flash sales, limited-time offers where timing matters",
        "Conversational sales: WhatsApp allows back-and-forth dialogue; email does not",
      ]},
      { type: "h2", text: "Where Email Wins" },
      { type: "ul", items: [
        "Long-form content: newsletters, detailed product updates, reports — WhatsApp is not designed for 1,000-word messages",
        "Archive-friendly communication: contracts, invoices, formal notifications that customers need to search and refer to later",
        "Large volume, low-priority outreach: if you're sending 100,000 transactional notifications per month, email is 10x cheaper",
        "B2B outreach: enterprise procurement teams often prefer email for formal business communication",
        "Content marketing: driving traffic to blog posts or resources works better via email newsletters than WhatsApp",
      ]},
      { type: "h2", text: "Legal and Compliance: WhatsApp Is Stricter" },
      { type: "p", text: "WhatsApp has stricter opt-in requirements than email marketing in India. Key rules:" },
      { type: "ul", items: [
        "WhatsApp: explicit opt-in required before you can send any marketing message; opt-in must specifically mention WhatsApp (not just 'contact me')",
        "Email: opt-in required under India's DPDP Act (Digital Personal Data Protection Act 2023), but enforcement is less mature",
        "WhatsApp: message templates must be pre-approved by Meta before use",
        "WhatsApp: recipients can block your number, reducing your Quality Rating and restricting sending",
        "Both channels: honour opt-out requests immediately; failure to do so violates both Meta's policies and Indian law",
      ]},
      { type: "h2", text: "The Right Strategy: Use Both" },
      { type: "p", text: "Successful Indian SMBs use both channels for what they each do best. A typical workflow:" },
      { type: "ul", items: [
        "New lead comes in via website: immediate WhatsApp message with a personalised greeting from your team",
        "Lead nurturing (days 2–14): weekly email newsletter with case studies and resources",
        "Promotional campaign: WhatsApp for time-sensitive offers; email for detailed product information",
        "Post-purchase: WhatsApp for delivery updates and support; email for formal receipts and warranty documentation",
        "Re-engagement (dormant customers): WhatsApp for short 'we miss you' offer; email for detailed win-back campaign",
      ]},
    ],
    faqs: [
      { question: "Is WhatsApp marketing legal in India?", answer: "Yes, with proper compliance. WhatsApp requires explicit opt-in before you can send marketing messages via the Business API — opt-in must specifically reference WhatsApp communication, not just general marketing consent. All marketing message templates must be pre-approved by Meta. India's Digital Personal Data Protection Act (DPDP Act 2023) also applies — you must maintain records of consent and honour opt-out requests immediately." },
      { question: "How many WhatsApp messages can I send per day?", answer: "The WhatsApp Business API uses a tiered system based on your phone number's quality rating and history. New numbers start at 250 marketing conversations per day. After demonstrating good quality (high delivery rates, low blocks), you scale to 1,000 → 10,000 → 100,000 per day. Maintaining a high message quality rating (avoiding blocks and spam reports) is essential for scaling." },
      { question: "Can I do WhatsApp marketing without the Business API?", answer: "Technically yes — the WhatsApp Business App has a broadcast list feature. But it has severe limitations: only 256 contacts per list, recipients must have saved your number, no automation, no analytics, and it's against WhatsApp's terms of service to use it for commercial bulk messaging. For any serious marketing use, the Business API is required." },
      { question: "What email marketing tool should Indian SMBs use?", answer: "For small lists (under 2,000 contacts): Brevo (formerly Sendinblue) has a generous free tier and good India-specific templates. For growing businesses: Mailchimp or Klaviyo if you're in e-commerce. For high-volume transactional email: Amazon SES or Resend (cheapest at scale). Most Indian businesses outgrow Mailchimp's free tier quickly — Brevo is better value for money at mid-scale." },
      { question: "How do I build a WhatsApp marketing list legally?", answer: "Collect opt-ins through: website forms (with a specific checkbox for WhatsApp communication), in-store sign-up sheets (with WhatsApp opt-in explicitly mentioned), QR codes that link to a WhatsApp chat where users initiate contact, checkout flows for e-commerce, and contests or lead magnets where WhatsApp opt-in is part of the entry. Never buy WhatsApp contact lists — it violates Meta's policies and Indian data protection law." },
    ],
  },
]

export const BLOG_SLUGS = BLOG_POSTS.map((p) => p.slug)
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/blog/data/posts.ts
git commit -m "feat(conveys): add 6 AI-optimized blog posts data file"
```

---

## Task 5: Blog [slug] dynamic page

**Files:**
- Create: `apps/conveys/app/blog/[slug]/page.tsx`

- [ ] **Step 1: Create the dynamic blog route**

Create `apps/conveys/app/blog/[slug]/page.tsx`:

```typescript
import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";
import { BLOG_POSTS } from "@/app/blog/data/posts";
import type { BlogSection } from "@/app/blog/data/posts";

export function generateStaticParams(): Array<{ slug: string }> {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return {};
  const url = `https://conveys.in/blog/${slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.publishedAt,
    },
  };
}

function renderSection(section: BlogSection, index: number): JSX.Element {
  switch (section.type) {
    case "h2":
      return (
        <h2 key={index} className="mt-10 text-2xl font-extrabold tracking-tight text-slate-900">
          {section.text}
        </h2>
      );
    case "h3":
      return (
        <h3 key={index} className="mt-6 text-xl font-bold text-slate-900">
          {section.text}
        </h3>
      );
    case "p":
      return (
        <p key={index} className="mt-4 text-base leading-relaxed text-slate-600">
          {section.text}
        </p>
      );
    case "ul":
      return (
        <ul key={index} className="mt-4 space-y-2">
          {(section.items ?? []).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-base text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      );
  }
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
): Promise<JSX.Element> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  const url = `https://conveys.in/blog/${post.slug}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: {
      "@type": "Organization",
      "@id": "https://conveys.in/#organization",
      name: "Conveys Information Technology",
    },
    publisher: {
      "@id": "https://conveys.in/#organization",
    },
    about: {
      "@type": "Thing",
      name: post.category,
    },
    isPartOf: {
      "@type": "Blog",
      url: "https://conveys.in/blog",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const formattedDate = new Date(post.publishedAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <ConveysHeader />

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-sm text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-slate-600">Blog</Link>
          <span>/</span>
          <span className="text-slate-600">{post.category}</span>
        </nav>

        {/* Header */}
        <header>
          <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">
            {post.category}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            {formattedDate} · {post.readingTime}
          </p>
        </header>

        {/* Intro */}
        <p className="mt-8 text-lg leading-relaxed text-slate-600 border-l-4 border-indigo-200 pl-5">
          {post.intro}
        </p>

        {/* Body sections */}
        <div className="mt-8">
          {post.sections.map((section, i) => renderSection(section, i))}
        </div>

        {/* FAQ */}
        <section className="mt-16 border-t border-slate-100 pt-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Frequently Asked Questions
          </h2>
          <div className="mt-6 space-y-4">
            {post.faqs.map((faq, i) => (
              <details key={i} className="group rounded-xl border border-slate-200 bg-slate-50 p-5 open:bg-white open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-slate-900">
                  {faq.question}
                  <svg className="h-4 w-4 flex-shrink-0 text-indigo-500 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Back link */}
        <div className="mt-12 border-t border-slate-100 pt-8">
          <Link href="/blog" className="font-semibold text-indigo-600 hover:text-indigo-700">
            ← Back to Blog
          </Link>
        </div>
      </main>

      <ConveysFooter />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/blog/[slug]/page.tsx
git commit -m "feat(conveys): add dynamic blog post route with Article + FAQPage JSON-LD"
```

---

## Task 6: Update blog listing page

**Files:**
- Modify: `apps/conveys/app/blog/page.tsx`

- [ ] **Step 1: Replace placeholder posts with real data**

Replace the entire contents of `apps/conveys/app/blog/page.tsx`:

```typescript
import Link from "next/link";
import type { JSX } from "react";
import type { Metadata } from "next";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";
import { BLOG_POSTS } from "@/app/blog/data/posts";

export const metadata: Metadata = {
  title: "Blog — Web Development Insights & Case Studies",
  description: "Guides, comparisons, and insights on WhatsApp Business API, web development, mobile apps, AI integration, and SaaS development for Indian businesses.",
  alternates: { canonical: "https://conveys.in/blog" },
  openGraph: { url: "https://conveys.in/blog" },
};

export default function BlogPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Blog</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Latest posts</h1>
        <p className="mt-3 text-slate-600">Practical guides on WhatsApp API, web development, mobile apps, and AI for Indian businesses.</p>
        <ul className="mt-10 divide-y divide-slate-100 border-t border-slate-100">
          {BLOG_POSTS.map((post) => (
            <li key={post.slug} className="py-6">
              <Link href={`/blog/${post.slug}`} className="group block">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{post.category}</span>
                <h2 className="mt-1 text-xl font-bold text-slate-900 group-hover:text-indigo-700">{post.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(post.publishedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })} · {post.readingTime}
                </p>
                <p className="mt-2 text-sm text-slate-600 line-clamp-2">{post.description}</p>
                <span className="mt-2 inline-block text-sm font-semibold text-indigo-600">Read more →</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10">
          <Link href="/" className="font-semibold text-indigo-600 hover:text-indigo-700">
            ← Back to home
          </Link>
        </p>
      </main>
      <ConveysFooter />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Verify in browser**

```bash
pnpm --filter @WBMSG/conveys dev
```

Visit `http://localhost:3001/blog` — should show 6 real posts with titles, categories, and dates.
Visit `http://localhost:3001/blog/whatsapp-business-api-india-guide` — should show full article with FAQ accordion.

- [ ] **Step 4: Commit**

```bash
git add apps/conveys/app/blog/page.tsx
git commit -m "feat(conveys): wire blog listing to real posts data"
```

---

## Task 7: Add FAQPage JSON-LD to whatsapp-crm page

**Files:**
- Modify: `apps/conveys/app/services/whatsapp-crm/page.tsx`

The page already has a `FAQ` array and visual FAQ section. It's missing FAQPage JSON-LD. The existing `jsonLd` only has `Service` schema.

- [ ] **Step 1: Add a second JSON-LD script for FAQPage**

In `apps/conveys/app/services/whatsapp-crm/page.tsx`, find the `export default function WhatsAppCRMPage()` function. After the existing `<script type="application/ld+json" .../>` block, add a second script tag:

Find this block inside the return statement:
```tsx
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
```

Replace with:
```tsx
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/services/whatsapp-crm/page.tsx
git commit -m "feat(conveys): add FAQPage JSON-LD to whatsapp-crm service page"
```

---

## Task 8: Add FAQPage JSON-LD to ai-solutions page

**Files:**
- Modify: `apps/conveys/app/services/ai-solutions/page.tsx`

Same pattern as Task 7 — the page has `FAQ` array and visual section; needs FAQPage JSON-LD.

- [ ] **Step 1: Add FAQPage JSON-LD script**

In `apps/conveys/app/services/ai-solutions/page.tsx`, find the `<script type="application/ld+json".../>` inside the return, and add a second script tag after it (same pattern as Task 7, referencing the `FAQ` array from this file):

```tsx
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/services/ai-solutions/page.tsx
git commit -m "feat(conveys): add FAQPage JSON-LD to ai-solutions service page"
```

---

## Task 9: Add FAQPage JSON-LD to mobile-app-development page

**Files:**
- Modify: `apps/conveys/app/services/mobile-app-development/page.tsx`

- [ ] **Step 1: Add FAQPage JSON-LD script**

Same pattern as Tasks 7 and 8. Find the existing `<script type="application/ld+json".../>` inside the return and add immediately after:

```tsx
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/services/mobile-app-development/page.tsx
git commit -m "feat(conveys): add FAQPage JSON-LD to mobile-app-development service page"
```

---

## Task 10: Update sitemap

**Files:**
- Modify: `apps/conveys/app/sitemap.ts`

- [ ] **Step 1: Add /about and 6 blog slugs to sitemap**

Replace the entire contents of `apps/conveys/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from "next";
import { BLOG_SLUGS } from "@/app/blog/data/posts";

const SERVICE_SLUGS = [
  // Cloud Services
  "site-migration",
  "cloud-infrastructure-setup",
  "whatsapp-business-api",
  "cloud-architecture-review",
  "devops-cicd",
  "database-administration",
  // IT Software Consultancy
  "mobile-app-development",
  "native-app-development",
  "custom-software-development",
  "cross-platform-development",
  "iot-development",
  "ui-ux-design",
  "frontend-development",
  "backend-development",
  "web-development",
  // Digital & IT Solutions
  "digital-transformation",
  "managed-it-services",
  "digital-marketing",
  "whatsapp-marketing-automation",
  "crm-integration",
  "managed-service-provider",
  "whatsapp-crm",
  "ai-solutions",
  // Product Development
  "saas-product-development",
  "mvp-development",
  "api-integration-development",
  "ecommerce-solutions",
  "b2b-platform-design",
  "whatsapp-commerce",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://conveys.in";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    ...SERVICE_SLUGS.map((slug) => ({
      url: `${base}/services/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    ...BLOG_SLUGS.map((slug) => ({
      url: `${base}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/cancellation`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/conveys type-check
```
Expected: no errors.

- [ ] **Step 3: Verify sitemap output**

```bash
pnpm --filter @WBMSG/conveys dev
```
Visit `http://localhost:3001/sitemap.xml` — should include `/about` and all 6 `/blog/<slug>` URLs.

- [ ] **Step 4: Commit**

```bash
git add apps/conveys/app/sitemap.ts
git commit -m "feat(conveys): add /about and 6 blog slugs to sitemap"
```

---

## Post-Implementation: Bing Webmaster Setup (Manual Steps for User)

After all code is deployed to `https://conveys.in`:

1. Go to `https://www.bing.com/webmasters`
2. Sign in with a Microsoft account (create one if needed)
3. Click **Add a site** → enter `https://conveys.in`
4. Choose **XML Sitemap** verification OR **Meta Tag** verification
5. If Meta Tag: copy the `content="..."` value, replace `BING_CODE_PLACEHOLDER` in `apps/conveys/app/layout.tsx` with it, redeploy
6. In Bing Webmaster → **Sitemaps** → submit `https://conveys.in/sitemap.xml`
7. Wait 24–48 hours for Bing to crawl and index pages

---

## Self-Review: Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| llms.txt | Task 1 |
| llms-full.txt | Task 1 |
| Bing verification meta tag | Task 2 |
| knowsAbout in Organization schema | Task 2 |
| /about page with AboutPage schema | Task 3 |
| 6 blog posts generated | Task 4 |
| Blog [slug] route + Article JSON-LD | Task 5 |
| Blog listing uses real posts | Task 6 |
| FAQPage JSON-LD on whatsapp-crm | Task 7 |
| FAQPage JSON-LD on ai-solutions | Task 8 |
| FAQPage JSON-LD on mobile-app-development | Task 9 |
| Sitemap updated | Task 10 |
| web-development FAQPage (already present) | Skipped — already done |
| SaaS + Digital Marketing FAQ via [slug] ServicePage | Already handled by existing ServicePage component |
