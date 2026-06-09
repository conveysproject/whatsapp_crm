# conveys.in Global SEO Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition conveys.in from India-local to global-first by correcting geo-signals in metadata/schema, cleaning existing content, and adding three new globally-targeted blog posts.

**Architecture:** All changes are isolated to `apps/conveys/`. Three layers: (1) technical geo-signals in layout.tsx, next.config.ts, service-page.tsx component, and [slug] fallback; (2) India references removed from services-data.ts, whatsapp-crm page, and existing blog posts; (3) three new global blog posts appended to posts.ts.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `apps/conveys/app/layout.tsx` | Modify | lang, locale, description, keywords, JSON-LD areaServed, hreflang link |
| `apps/conveys/next.config.ts` | Modify | Add HTTPS redirect rule |
| `apps/conveys/components/service-page.tsx` | Modify | buildMetadata locale, buildJsonLd areaServed |
| `apps/conveys/app/services/[slug]/page.tsx` | Modify | Fallback metadata title/description/locale + body text |
| `apps/conveys/app/services/whatsapp-crm/page.tsx` | Modify | Title, description, JSON-LD areaServed |
| `apps/conveys/lib/services-data.ts` | Modify | Remove "India" from all 24 metaTitle + metaDescription fields |
| `apps/conveys/app/blog/data/posts.ts` | Modify | Update 5 existing post descriptions/intros; append 3 new global posts |
| `apps/conveys/app/blog/data/posts.test.ts` | Create | Schema validation + global post assertions |

---

## Task 1: Fix global language signals in layout.tsx

**Files:**
- Modify: `apps/conveys/app/layout.tsx`

- [ ] **Step 1: Apply all layout.tsx changes**

Replace the entire file content with:

```tsx
import type { ReactNode, JSX } from "react";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-conveys",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://conveys.in"),
  title: {
    default: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    template: "%s | Conveys IT",
  },
  description:
    "Professional web development, mobile apps, WhatsApp CRM, and AI solutions for businesses worldwide. In-house team, fixed pricing.",
  keywords: [
    "web development agency",
    "website design and development",
    "custom software development",
    "SaaS product development",
    "mobile app development agency",
    "cross-platform app development",
    "WhatsApp CRM software",
    "WhatsApp Business API",
    "AI solutions for business",
    "ecommerce development agency",
  ],
  authors: [{ name: "Conveys Information Technology", url: "https://conveys.in" }],
  creator: "Conveys Information Technology",
  publisher: "Conveys Information Technology",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  openGraph: {
    title: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    description:
      "Professional web development, mobile apps, WhatsApp CRM, and AI solutions for businesses worldwide. Get a free quote today.",
    url: "https://conveys.in",
    siteName: "Conveys Information Technology",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    description:
      "Professional web development, mobile apps, WhatsApp CRM, and AI solutions for businesses worldwide.",
  },
  alternates: {
    canonical: "https://conveys.in",
  },
  verification: {
    other: {
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFY ?? "",
    },
  },
  icons: {
    icon: [
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon.ico" },
    ],
    shortcut: "/favicon/favicon.ico",
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/favicon/site.webmanifest",
  appleWebApp: {
    title: "Conveys IT",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "LocalBusiness"],
      "@id": "https://conveys.in/#organization",
      name: "Conveys Information Technology",
      url: "https://conveys.in",
      logo: "https://conveys.in/conveys-logo.png",
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
      areaServed: { "@type": "AdministrativeArea", name: "Worldwide" },
      description:
        "Custom software development company. We build web applications, mobile apps, WhatsApp CRM solutions, AI-powered tools, and SaaS products for SMBs and startups globally.",
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://conveys.in/#website",
      url: "https://conveys.in",
      name: "Conveys Information Technology",
      publisher: { "@id": "https://conveys.in/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://conveys.in/?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <head>
        <link rel="alternate" hreflang="en" href="https://conveys.in" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        id="top"
        className={`${poppins.variable} bg-white font-sans text-slate-900`}
        style={{ fontFamily: "var(--font-conveys), system-ui, sans-serif" }}
      >
        {children}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-4Q09E6BQC1"
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-4Q09E6BQC1');
        `}
      </Script>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/layout.tsx
git commit -m "feat(conveys): global-first lang, locale, hreflang, keywords, JSON-LD areaServed"
```

---

## Task 2: Add HTTPS redirect in next.config.ts

**Files:**
- Modify: `apps/conveys/next.config.ts`

- [ ] **Step 1: Update next.config.ts**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/index.html",
        destination: "/",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
        destination: "https://conveys.in/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/next.config.ts
git commit -m "feat(conveys): enforce HTTPS redirect to fix GSC http/https canonical split"
```

---

## Task 3: Fix shared service-page.tsx component

**Files:**
- Modify: `apps/conveys/components/service-page.tsx` lines 10–27 and 30–40

- [ ] **Step 1: Update buildMetadata locale**

Find in `apps/conveys/components/service-page.tsx`:
```ts
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url,
      siteName: "Conveys",
      locale: "en_IN",
      type: "website",
    },
```

Replace with:
```ts
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url,
      siteName: "Conveys",
      locale: "en_US",
      type: "website",
    },
```

- [ ] **Step 2: Update buildJsonLd areaServed**

Find:
```ts
        areaServed: { "@type": "Country", name: "India" },
```

Replace with:
```ts
        areaServed: { "@type": "AdministrativeArea", name: "Worldwide" },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/conveys/components/service-page.tsx
git commit -m "feat(conveys): global locale and areaServed in shared service-page component"
```

---

## Task 4: Fix [slug]/page.tsx fallback metadata and body text

**Files:**
- Modify: `apps/conveys/app/services/[slug]/page.tsx`

- [ ] **Step 1: Fix fallback generateMetadata**

Find:
```ts
  return {
    title: `${service.title} Services in India | Conveys`,
    description: `${service.title} services for Indian businesses — expert team, fixed pricing, and proven delivery. Get a free quote today.`,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: `${service.title} | Conveys`, url, siteName: "Conveys", locale: "en_IN", type: "website" },
  };
```

Replace with:
```ts
  return {
    title: `${service.title} Services | Conveys`,
    description: `${service.title} services — expert team, fixed pricing, and proven delivery. Get a free quote today.`,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: `${service.title} | Conveys`, url, siteName: "Conveys", locale: "en_US", type: "website" },
  };
```

- [ ] **Step 2: Fix fallback body text**

Find:
```tsx
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Expert {service.title.toLowerCase()} services for Indian businesses — in-house team, fixed pricing, and proven delivery.
            </p>
```

Replace with:
```tsx
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Expert {service.title.toLowerCase()} services — in-house team, fixed pricing, and proven delivery.
            </p>
```

- [ ] **Step 3: Fix fallback coming-soon paragraph**

Find:
```tsx
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              We&apos;re putting together detailed information about our {service.title.toLowerCase()} services. In the meantime, reach out directly and we&apos;ll scope your project same day.
            </p>
```

This text is fine — no India reference. No change needed.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/conveys/app/services/[slug]/page.tsx
git commit -m "feat(conveys): global-first fallback metadata in dynamic service slug page"
```

---

## Task 5: Fix whatsapp-crm/page.tsx

**Files:**
- Modify: `apps/conveys/app/services/whatsapp-crm/page.tsx`

- [ ] **Step 1: Update metadata**

Find:
```ts
export const metadata: Metadata = {
  title: "WhatsApp Business API & CRM — Mumbai",
  description:
    "Set up WhatsApp Business API for your business in India. Automate conversations, run broadcast campaigns, and manage your customer pipeline.",
  alternates: { canonical: "https://conveys.in/services/whatsapp-crm" },
  openGraph: { url: "https://conveys.in/services/whatsapp-crm" },
};
```

Replace with:
```ts
export const metadata: Metadata = {
  title: "WhatsApp CRM & Business API for Small Business",
  description:
    "Set up WhatsApp Business API for your business. Automate conversations, run broadcast campaigns, and manage your entire customer pipeline on WhatsApp.",
  alternates: { canonical: "https://conveys.in/services/whatsapp-crm" },
  openGraph: { url: "https://conveys.in/services/whatsapp-crm", locale: "en_US" },
};
```

- [ ] **Step 2: Update JSON-LD areaServed and description**

Find:
```ts
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": "https://conveys.in/services/whatsapp-crm#service",
  name: "WhatsApp Business API & CRM",
  provider: { "@id": "https://conveys.in/#organization" },
  areaServed: { "@type": "Country", name: "India" },
  description:
    "Set up WhatsApp Business API for your business in India. Automate conversations, run broadcast campaigns, and manage your customer pipeline.",
  url: "https://conveys.in/services/whatsapp-crm",
};
```

Replace with:
```ts
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": "https://conveys.in/services/whatsapp-crm#service",
  name: "WhatsApp CRM & Business API",
  provider: { "@id": "https://conveys.in/#organization" },
  areaServed: { "@type": "AdministrativeArea", name: "Worldwide" },
  description:
    "Set up WhatsApp Business API for your business. Automate conversations, run broadcast campaigns, and manage your entire customer pipeline on WhatsApp.",
  url: "https://conveys.in/services/whatsapp-crm",
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/conveys/app/services/whatsapp-crm/page.tsx
git commit -m "feat(conveys): global metadata and areaServed on whatsapp-crm service page"
```

---

## Task 6: Remove "India" from all services-data.ts metaTitle and metaDescription fields

**Files:**
- Modify: `apps/conveys/lib/services-data.ts`

Apply these exact find/replace pairs in order. Each pair shows the old string → new string for one service's two fields.

- [ ] **Step 1: cloud-infrastructure-setup**

Find:
```
    metaTitle: "Cloud Infrastructure Setup Services India | AWS, GCP, Azure | Conveys",
    metaDescription: "Expert cloud infrastructure setup on AWS, GCP, and Azure for Indian businesses. Kubernetes, load balancing, VPN, monitoring — fixed pricing, in-house team.",
```
Replace:
```
    metaTitle: "Cloud Infrastructure Setup Services | AWS, GCP, Azure | Conveys",
    metaDescription: "Expert cloud infrastructure setup on AWS, GCP, and Azure. Kubernetes, load balancing, VPN, monitoring — fixed pricing, in-house team.",
```

- [ ] **Step 2: whatsapp-business-api**

Find:
```
    metaTitle: "WhatsApp Business API Setup India — Meta WABA Onboarding | Conveys",
    metaDescription: "Full Meta WhatsApp Business API onboarding — business verification, number registration, template approvals, webhook integration. Fixed pricing for Indian businesses.",
```
Replace:
```
    metaTitle: "WhatsApp Business API Setup — Meta WABA Onboarding | Conveys",
    metaDescription: "Full Meta WhatsApp Business API onboarding — business verification, number registration, template approvals, webhook integration. Fixed pricing.",
```

- [ ] **Step 3: cloud-architecture-review**

Find:
```
    metaTitle: "Cloud Architecture Review & Audit India | AWS, GCP, Azure | Conveys",
```
Replace:
```
    metaTitle: "Cloud Architecture Review & Audit | AWS, GCP, Azure | Conveys",
```

- [ ] **Step 4: devops-cicd**

Find:
```
    metaTitle: "DevOps & CI/CD Pipeline Setup India | GitHub Actions, Kubernetes | Conveys",
    metaDescription: "CI/CD pipelines, Docker containerisation, Kubernetes deployment, and infrastructure as code for Indian engineering teams. Fixed pricing, in-house DevOps engineers.",
```
Replace:
```
    metaTitle: "DevOps & CI/CD Pipeline Setup | GitHub Actions, Kubernetes | Conveys",
    metaDescription: "CI/CD pipelines, Docker containerisation, Kubernetes deployment, and infrastructure as code for engineering teams. Fixed pricing, in-house DevOps engineers.",
```

- [ ] **Step 5: database-administration**

Find:
```
    metaTitle: "Database Administration Services India | PostgreSQL, MySQL, MongoDB | Conveys",
    metaDescription: "Schema design, query optimisation, backup, HA, and migration by experienced DBAs. PostgreSQL, MySQL, MongoDB for Indian businesses. Fixed pricing.",
```
Replace:
```
    metaTitle: "Database Administration Services | PostgreSQL, MySQL, MongoDB | Conveys",
    metaDescription: "Schema design, query optimisation, backup, HA, and migration by experienced DBAs. PostgreSQL, MySQL, MongoDB. Fixed pricing.",
```

- [ ] **Step 6: native-app-development**

Find:
```
    metaTitle: "Native iOS & Android App Development India | Swift, Kotlin | Conveys",
    metaDescription: "Swift for iOS, Kotlin for Android — platform-native apps that leverage the full device API and pass App Store review first time. Fixed pricing for Indian businesses.",
```
Replace:
```
    metaTitle: "Native iOS & Android App Development | Swift, Kotlin | Conveys",
    metaDescription: "Swift for iOS, Kotlin for Android — platform-native apps that leverage the full device API and pass App Store review first time. Fixed pricing.",
```

- [ ] **Step 7: custom-software-development**

Find:
```
    metaTitle: "Custom Software Development India | Web Apps, Portals, APIs | Conveys",
    metaDescription: "Custom web applications, enterprise portals, and internal tools for Indian businesses. In-house team, fixed pricing, full IP ownership. Next.js, Node.js, PostgreSQL.",
```
Replace:
```
    metaTitle: "Custom Software Development | Web Apps, Portals, APIs | Conveys",
    metaDescription: "Custom web applications, enterprise portals, and internal tools for businesses. In-house team, fixed pricing, full IP ownership. Next.js, Node.js, PostgreSQL.",
```

- [ ] **Step 8: cross-platform-development**

Find:
```
    metaTitle: "Cross-Platform App Development India | React Native, Expo | Conveys",
    metaDescription: "React Native and Expo apps for iOS and Android from a single codebase. 80% code sharing, native performance, App Store ready. Fixed pricing for Indian businesses.",
```
Replace:
```
    metaTitle: "Cross-Platform App Development | React Native, Expo | Conveys",
    metaDescription: "React Native and Expo apps for iOS and Android from a single codebase. 80% code sharing, native performance, App Store ready. Fixed pricing.",
```

- [ ] **Step 9: iot-development**

Find:
```
    metaTitle: "IoT Development Services India | Firmware, Cloud, Dashboard | Conveys",
    metaDescription: "Full-stack IoT development — embedded firmware, cloud connectivity, real-time dashboards, and device management for Indian industrial and consumer applications.",
```
Replace:
```
    metaTitle: "IoT Development Services | Firmware, Cloud, Dashboard | Conveys",
    metaDescription: "Full-stack IoT development — embedded firmware, cloud connectivity, real-time dashboards, and device management for industrial and consumer applications.",
```

- [ ] **Step 10: ui-ux-design**

Find:
```
    metaTitle: "UI/UX Design Services India | Figma, Prototyping, Design Systems | Conveys",
    metaDescription: "UX research, wireframing, high-fidelity Figma prototyping, and design systems for Indian businesses. Pixel-perfect developer handoff included.",
```
Replace:
```
    metaTitle: "UI/UX Design Services | Figma, Prototyping, Design Systems | Conveys",
    metaDescription: "UX research, wireframing, high-fidelity Figma prototyping, and design systems for businesses. Pixel-perfect developer handoff included.",
```

- [ ] **Step 11: frontend-development**

Find:
```
    metaTitle: "Frontend Development Services India | React, Next.js, TypeScript | Conveys",
```
Replace:
```
    metaTitle: "Frontend Development Services | React, Next.js, TypeScript | Conveys",
```

- [ ] **Step 12: backend-development**

Find:
```
    metaTitle: "Backend Development Services India | Node.js, Fastify, PostgreSQL | Conveys",
    metaDescription: "Fastify REST APIs, PostgreSQL schemas, Redis caching, and BullMQ queues for Indian businesses. Secure, observable, production-ready backends. Fixed pricing.",
```
Replace:
```
    metaTitle: "Backend Development Services | Node.js, Fastify, PostgreSQL | Conveys",
    metaDescription: "Fastify REST APIs, PostgreSQL schemas, Redis caching, and BullMQ queues. Secure, observable, production-ready backends. Fixed pricing.",
```

- [ ] **Step 13: digital-transformation**

Find:
```
    metaTitle: "Digital Transformation Services India | Legacy Modernisation | Conveys",
    metaDescription: "Digital strategy, legacy modernisation, process automation, and cloud migration for Indian businesses. Phased approach — the business never stops. Fixed pricing.",
```
Replace:
```
    metaTitle: "Digital Transformation Services | Legacy Modernisation | Conveys",
    metaDescription: "Digital strategy, legacy modernisation, process automation, and cloud migration. Phased approach — the business never stops. Fixed pricing.",
```

- [ ] **Step 14: managed-it-services**

Find:
```
    metaTitle: "Managed IT Services India | 24/7 Monitoring, Help Desk, Backup | Conveys",
    metaDescription: "24/7 infrastructure monitoring, help desk support, patch management, backup, and security for Indian businesses on a predictable monthly retainer.",
```
Replace:
```
    metaTitle: "Managed IT Services | 24/7 Monitoring, Help Desk, Backup | Conveys",
    metaDescription: "24/7 infrastructure monitoring, help desk support, patch management, backup, and security on a predictable monthly retainer.",
```

- [ ] **Step 15: digital-marketing**

Find:
```
    metaTitle: "Digital Marketing Services India | SEO, Google Ads, Meta Ads | Conveys",
    metaDescription: "SEO, Google Ads, Meta Ads, and content marketing for Indian SMBs. Every rupee tracked, every result reported. Fixed monthly management fee.",
```
Replace:
```
    metaTitle: "Digital Marketing Services | SEO, Google Ads, Meta Ads | Conveys",
    metaDescription: "SEO, Google Ads, Meta Ads, and content marketing for SMBs. Every result tracked and reported. Fixed monthly management fee.",
```

- [ ] **Step 16: whatsapp-marketing-automation**

Find:
```
    metaTitle: "WhatsApp Marketing Automation India | Official Meta API | Conveys",
```
Replace:
```
    metaTitle: "WhatsApp Marketing Automation | Official Meta API | Conveys",
```

- [ ] **Step 17: crm-integration**

Find:
```
    metaTitle: "CRM Integration & Setup Services India | HubSpot, Zoho, Salesforce | Conveys",
    metaDescription: "CRM selection, setup, data migration, and API integration with WhatsApp, email, and payments for Indian businesses. HubSpot, Zoho, Salesforce, and custom CRMs.",
```
Replace:
```
    metaTitle: "CRM Integration & Setup Services | HubSpot, Zoho, Salesforce | Conveys",
    metaDescription: "CRM selection, setup, data migration, and API integration with WhatsApp, email, and payments. HubSpot, Zoho, Salesforce, and custom CRMs.",
```

- [ ] **Step 18: managed-service-provider**

Find:
```
    metaTitle: "Managed Service Provider India | End-to-End IT Management | Conveys",
    metaDescription: "End-to-end IT management — infrastructure, security, helpdesk, vendor management, and technology roadmap for Indian businesses. Predictable monthly cost, named account manager.",
```
Replace:
```
    metaTitle: "Managed Service Provider | End-to-End IT Management | Conveys",
    metaDescription: "End-to-end IT management — infrastructure, security, helpdesk, vendor management, and technology roadmap. Predictable monthly cost, named account manager.",
```

- [ ] **Step 19: saas-product-development**

Find:
```
    metaTitle: "SaaS Product Development India | Multi-Tenant, Stripe, Clerk | Conveys",
    metaDescription: "Multi-tenant SaaS products built end-to-end — architecture, billing, admin dashboard, API, and launch support. You own the IP. Fixed pricing for Indian founders.",
```
Replace:
```
    metaTitle: "SaaS Product Development | Multi-Tenant, Stripe, Clerk | Conveys",
    metaDescription: "Multi-tenant SaaS products built end-to-end — architecture, billing, admin dashboard, API, and launch support. You own the IP. Fixed pricing.",
```

- [ ] **Step 20: mvp-development**

Find:
```
    metaTitle: "MVP Development Services India | 8-Week Build | Conveys",
    metaDescription: "Focused MVP development in 8 weeks for Indian founders. We scope ruthlessly, build what matters, and ship before the window closes. Fixed price, you own the IP.",
```
Replace:
```
    metaTitle: "MVP Development Services | 8-Week Build | Conveys",
    metaDescription: "Focused MVP development in 8 weeks. We scope ruthlessly, build what matters, and ship before the window closes. Fixed price, you own the IP.",
```

- [ ] **Step 21: api-integration-development**

Find:
```
    metaTitle: "API & Integration Development India | REST, Webhooks, OAuth | Conveys",
    metaDescription: "REST APIs, webhooks, OAuth flows, and third-party integrations for Indian businesses. OpenAPI documentation included. Fastify, Node.js, TypeScript. Fixed pricing.",
```
Replace:
```
    metaTitle: "API & Integration Development | REST, Webhooks, OAuth | Conveys",
    metaDescription: "REST APIs, webhooks, OAuth flows, and third-party integrations. OpenAPI documentation included. Fastify, Node.js, TypeScript. Fixed pricing.",
```

- [ ] **Step 22: ecommerce-solutions**

Find:
```
    metaTitle: "E-commerce Development India | Razorpay, Stripe, Custom Store | Conveys",
```
Replace:
```
    metaTitle: "E-commerce Development | Razorpay, Stripe, Custom Store | Conveys",
```

- [ ] **Step 23: b2b-platform-design**

Find:
```
    metaTitle: "B2B Platform Design Services India | Portal UX, Design Systems | Conveys",
```
Replace:
```
    metaTitle: "B2B Platform Design Services | Portal UX, Design Systems | Conveys",
```

- [ ] **Step 24: whatsapp-commerce**

Find:
```
    metaTitle: "WhatsApp Commerce Solutions India | Catalogue, Checkout, Payments | Conveys",
```
Replace:
```
    metaTitle: "WhatsApp Commerce Solutions | Catalogue, Checkout, Payments | Conveys",
```

- [ ] **Step 25: Verify no "India" remains in metaTitle or metaDescription fields**

```bash
grep -n "metaTitle\|metaDescription" apps/conveys/lib/services-data.ts | grep -i "india"
```

Expected: no output (zero matches).

- [ ] **Step 26: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 27: Commit**

```bash
git add apps/conveys/lib/services-data.ts
git commit -m "feat(conveys): remove India from all service metaTitle and metaDescription fields"
```

---

## Task 7: Write posts.test.ts (TDD — write test first, verify it fails)

**Files:**
- Create: `apps/conveys/app/blog/data/posts.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from "vitest";
import { BLOG_POSTS } from "./posts";

const GLOBAL_SLUGS = [
  "whatsapp-crm-for-small-business",
  "saas-product-development-cost-timeline",
  "cross-platform-vs-native-app-development",
];

describe("BLOG_POSTS", () => {
  it("all posts have required fields", () => {
    for (const post of BLOG_POSTS) {
      expect(post.slug, `${post.slug}: missing slug`).toBeTruthy();
      expect(post.title, `${post.slug}: missing title`).toBeTruthy();
      expect(post.description, `${post.slug}: missing description`).toBeTruthy();
      expect(post.publishedAt, `${post.slug}: missing publishedAt`).toBeTruthy();
      expect(post.sections.length, `${post.slug}: no sections`).toBeGreaterThan(0);
      expect(post.faqs.length, `${post.slug}: no FAQs`).toBeGreaterThanOrEqual(3);
    }
  });

  it("global posts exist with no 'india' in slug or description", () => {
    for (const slug of GLOBAL_SLUGS) {
      const post = BLOG_POSTS.find((p) => p.slug === slug);
      expect(post, `post '${slug}' not found`).toBeDefined();
      expect(post!.slug.toLowerCase()).not.toContain("india");
      expect(post!.description.toLowerCase()).not.toContain("india");
    }
  });

  it("has at least 8 posts total", () => {
    expect(BLOG_POSTS.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails (3 global posts don't exist yet)**

```bash
pnpm --filter @WBMSG/conveys test -- --reporter=verbose posts.test
```

Expected: 2 tests pass ("all posts have required fields" + existing posts), 2 tests FAIL:
- "global posts exist with no 'india' in slug or description" — FAIL (posts not added yet)
- "has at least 8 posts total" — FAIL (only 5 posts currently)

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/conveys/app/blog/data/posts.test.ts
git commit -m "test(conveys): add blog posts schema validation and global post assertions"
```

---

## Task 8: Update existing blog post descriptions and intros

**Files:**
- Modify: `apps/conveys/app/blog/data/posts.ts`

Apply these changes to the 5 existing posts. Only `description` and `intro` fields change — slugs, titles, sections, and FAQs are untouched.

- [ ] **Step 1: Update whatsapp-business-api-india-guide**

Find:
```ts
    description:
      "Everything Indian businesses need to know about WhatsApp Business API — how it works, cost, approval process, and how it differs from the WhatsApp Business App.",
```
Replace:
```ts
    description:
      "Everything businesses need to know about WhatsApp Business API — how it works, cost, approval process, and how it differs from the WhatsApp Business App.",
```

Find:
```ts
    intro:
      "WhatsApp has over 500 million active users in India — more than any other country. For Indian businesses, it has become the primary channel for customer communication, replacing phone calls and SMS. WhatsApp Business API takes this a step further, turning WhatsApp into a fully automated, scalable business platform. Here is everything you need to know.",
```
Replace:
```ts
    intro:
      "WhatsApp has over 2 billion active users worldwide — and over 500 million in India alone. For businesses across markets, it has become the primary channel for customer communication, replacing phone calls and SMS. WhatsApp Business API takes this a step further, turning WhatsApp into a fully automated, scalable business platform. Here is everything you need to know.",
```

- [ ] **Step 2: Update web-development-company-india-how-to-choose**

Find:
```ts
    description:
      "A practical guide for Indian businesses evaluating web development agencies — what to check, what to avoid, realistic pricing, and the right questions to ask before signing.",
```
Replace:
```ts
    description:
      "A practical guide for businesses evaluating web development agencies — what to check, what to avoid, realistic pricing, and the right questions to ask before signing.",
```

Find:
```ts
    intro:
      "India has tens of thousands of web development agencies — from solo freelancers to 500-person studios. Prices range from ₹5,000 to ₹50,00,000 for ostensibly similar work. Choosing the wrong partner wastes months and money. This guide gives you a systematic way to evaluate your options.",
```
Replace:
```ts
    intro:
      "There are hundreds of thousands of web development agencies worldwide — from solo freelancers to 500-person studios. Prices vary by 10–20× for ostensibly similar work. Choosing the wrong partner wastes months and money. This guide gives you a systematic way to evaluate your options.",
```

- [ ] **Step 3: Update ios-android-cross-platform-india-startups**

Find:
```ts
    description:
      "A practical breakdown of iOS, Android, and cross-platform development for Indian startups — cost, timeline, when to choose each, and why most Indian businesses should start with Android.",
```
Replace:
```ts
    description:
      "A practical breakdown of iOS, Android, and cross-platform development for startups — cost, timeline, when to choose each, and how to pick the right platform for your market.",
```

Find:
```ts
    intro:
      "One of the first decisions in mobile app development is platform: iOS, Android, or both via cross-platform frameworks like React Native or Flutter. For Indian startups, this decision has a clear answer in most cases — but understanding why helps you make the right call for your specific situation.",
```
Replace:
```ts
    intro:
      "One of the first decisions in mobile app development is platform: iOS, Android, or both via cross-platform frameworks like React Native or Flutter. The answer depends on your target market, budget, and product type — but the framework for making the decision is the same everywhere. Here is how to think about it.",
```

- [ ] **Step 4: Update ai-llm-integration-indian-business**

Find:
```ts
    description:
      "A practical guide to AI and LLM integration for Indian SMBs — what types of AI exist, real use cases, cost, and how to evaluate vendors. No hype, just actionable information.",
```
Replace:
```ts
    description:
      "A practical guide to AI and LLM integration for SMBs — what types of AI exist, real use cases, cost, and how to evaluate vendors. No hype, just actionable information.",
```

Find:
```ts
    intro:
      "The AI conversation in India has moved past 'should we use AI?' to 'how do we actually implement it without wasting money?' Large language models (LLMs) like Anthropic Claude and OpenAI GPT-4 are now practical tools for business automation — but only if you implement them for the right problems. This guide cuts through the hype.",
```
Replace:
```ts
    intro:
      "The AI conversation in business has moved past 'should we use AI?' to 'how do we actually implement it without wasting money?' Large language models (LLMs) like Anthropic Claude and OpenAI GPT-4 are now practical tools for business automation — but only if you implement them for the right problems. This guide cuts through the hype.",
```

- [ ] **Step 5: Update saas-product-development-india-cost-timeline**

Find:
```ts
    description:
      "Everything founders and product teams in India need to know about building a SaaS product — realistic costs, phase-by-phase timelines, tech stack choices, and common mistakes.",
```
Replace:
```ts
    description:
      "Everything founders and product teams need to know about building a SaaS product — realistic costs, phase-by-phase timelines, tech stack choices, and the mistakes that kill early-stage products.",
```

Find:
```ts
    intro:
      "India is the world's second-largest SaaS market by user count and growing. Dozens of Indian SaaS companies have scaled to $1M+ ARR — Zoho, Freshworks, Chargebee started here. If you're building a SaaS product in India, you have access to world-class development talent at competitive prices. Here's a realistic picture of what it takes.",
```
Replace:
```ts
    intro:
      "The global SaaS market exceeded $197 billion in 2023 and continues to grow. World-class SaaS companies have been built everywhere — from San Francisco to Singapore to Mumbai. If you're building a SaaS product, you have access to world-class development talent at competitive prices across multiple markets. Here's a realistic picture of what it takes.",
```

- [ ] **Step 6: Update whatsapp-marketing-vs-email-marketing-india**

Find:
```ts
    description:
      "A data-driven comparison of WhatsApp marketing and email marketing for Indian small businesses — open rates, costs, compliance, and which channel to use for which purpose.",
```
Replace:
```ts
    description:
      "A data-driven comparison of WhatsApp marketing and email marketing — open rates, costs, compliance, and which channel to use for which purpose.",
```

Find:
```ts
    intro:
      "Indian SMBs spent years building email lists that now get 20% open rates on a good day. Meanwhile, their customers open WhatsApp messages within 3 minutes. WhatsApp marketing via the Business API has changed the calculus of digital marketing for Indian businesses — but it's not a wholesale replacement for email. Here's how to think about both channels.",
```
Replace:
```ts
    intro:
      "Businesses have spent years building email lists that now get 20% open rates on a good day. Meanwhile, customers open WhatsApp messages within 3 minutes. WhatsApp marketing via the Business API has changed the calculus of digital marketing — but it is not a wholesale replacement for email. Here is how to think about both channels.",
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/conveys exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/conveys/app/blog/data/posts.ts
git commit -m "feat(conveys): update existing blog post descriptions and intros to global framing"
```

---

## Task 9: Add global blog post 1 — WhatsApp CRM for small business

**Files:**
- Modify: `apps/conveys/app/blog/data/posts.ts`

- [ ] **Step 1: Append the post to BLOG_POSTS**

Find the closing bracket of the array — the last `},` before `]` at the end of `BLOG_POSTS`. Append after the last existing post entry:

```ts
  {
    slug: "whatsapp-crm-for-small-business",
    title: "WhatsApp CRM for Small Business: Complete Guide (2025)",
    description:
      "How WhatsApp CRM software works, what features matter, and how small businesses use it to automate conversations, run campaigns, and manage their customer pipeline.",
    publishedAt: "2026-06-09",
    category: "WhatsApp CRM",
    readingTime: "8 min read",
    intro:
      "WhatsApp has over 2 billion active users across 180+ countries. For small businesses, it has become the default channel for customer communication — faster than email, more personal than a website form, and already on every customer's phone. WhatsApp CRM software turns that into a structured, scalable sales and support system. Here is everything you need to know.",
    sections: [
      { type: "h2", text: "What Is a WhatsApp CRM?" },
      { type: "p", text: "A WhatsApp CRM is software that connects your business WhatsApp number (via the official WhatsApp Business API) to a customer management platform. Instead of replying to messages one-by-one on your phone, your whole team manages conversations in a shared inbox — with contact history, notes, tags, and automation all in one place." },
      { type: "h2", text: "WhatsApp Business App vs API vs CRM — What Is the Difference?" },
      { type: "ul", items: [
        "WhatsApp Business App: free mobile app, one user, one device, broadcast limited to 256 contacts who must have saved your number, no automation — suitable for very small operations only",
        "WhatsApp Business API: developer interface from Meta, supports automation, multi-agent teams, unlimited broadcasts to opted-in contacts, requires Meta business verification",
        "WhatsApp CRM: software built on top of the API — adds a shared team inbox, contact management, campaign builder, chatbot flows, and analytics so non-technical teams can use the API without writing code",
      ]},
      { type: "h2", text: "Key Features to Look for in a WhatsApp CRM" },
      { type: "ul", items: [
        "Shared team inbox: multiple agents handle conversations simultaneously; conversations can be assigned, transferred, and tracked with full history",
        "Contact management: import contacts via CSV, add custom fields, tags, notes, and segment into lists",
        "Broadcast campaigns: send approved message templates to segmented lists; track delivery, read rates, and replies in real time",
        "Chatbot / flow builder: automate responses, qualify leads, route to the right agent, and collect data — no coding required",
        "Multi-channel integration: connect to your CRM, e-commerce platform, or website for context-aware conversations",
        "Analytics dashboard: campaign performance, agent response times, conversation resolution rates, and opt-out tracking",
      ]},
      { type: "h2", text: "Use Cases by Business Type" },
      { type: "ul", items: [
        "Retail & e-commerce: abandoned cart recovery, order status notifications, post-purchase upsell campaigns",
        "Service businesses: appointment booking and reminders via chatbot, re-booking campaigns to lapsed clients",
        "Real estate: chatbot qualifies incoming leads (budget, location, timeline) before handing to an agent",
        "Education: automated fee reminders, admission updates, parent communication at scale",
        "Healthcare: appointment confirmations and reminders, test result notifications, follow-up messages",
        "B2B sales: lead follow-up within 5 minutes of enquiry, proposal delivery, deal stage tracking in the shared inbox",
      ]},
      { type: "h2", text: "WhatsApp CRM Pricing" },
      { type: "ul", items: [
        "Meta charges per conversation (24-hour window): marketing $0.01–0.09, utility $0.003–0.01, authentication $0.002–0.008 — varies by country",
        "WhatsApp CRM software: typically $30–200/month for small teams; enterprise platforms can reach $500+/month",
        "Total monthly cost for 1,000 marketing conversations: $10–90 in Meta fees + $30–50 for the CRM platform",
        "Most businesses find WhatsApp CRM 3–5× more cost-effective than email when measured by cost per reply",
      ]},
      { type: "h2", text: "How to Get Started" },
      { type: "ul", items: [
        "Step 1: Get the WhatsApp Business API — requires a Meta Business Manager account with verified business documents",
        "Step 2: Register your business phone number (new number or migrated from WhatsApp Business App)",
        "Step 3: Choose a WhatsApp CRM platform that fits your team size and use case",
        "Step 4: Import your opted-in contact list and create your first Meta-approved message template",
        "Step 5: Build a basic chatbot flow for incoming messages — at minimum a greeting and routing menu",
        "Step 6: Run your first broadcast to a small segment; monitor delivery and reply rates before scaling",
      ]},
    ],
    faqs: [
      { question: "What is the difference between WhatsApp CRM and a regular CRM?", answer: "A regular CRM (Salesforce, HubSpot, Zoho) tracks leads and deals but communicates primarily via email. A WhatsApp CRM is built around WhatsApp as the communication channel — it adds shared inbox, broadcast campaigns, and chatbot automation on top of standard contact management. Some businesses use both: a traditional CRM for pipeline tracking and a WhatsApp CRM for day-to-day customer messaging." },
      { question: "Can multiple team members use the same WhatsApp number?", answer: "Yes — this is one of the core advantages of the WhatsApp Business API over the WhatsApp Business App. A WhatsApp CRM gives all your agents a shared inbox on the same number. Conversations can be assigned to specific agents, transferred between teams, and tracked with full history. The customer sees one consistent business number regardless of which agent is handling their conversation." },
      { question: "Do customers need to save my number to receive WhatsApp messages?", answer: "No. Unlike the WhatsApp Business App broadcast feature (which requires contacts to have saved your number), the WhatsApp Business API can message any opted-in customer without them saving your contact. The only requirement is that they have explicitly opted in to receive messages from your business." },
      { question: "What is a WhatsApp message template and why do I need one?", answer: "WhatsApp requires pre-approved message templates for all business-initiated conversations outside of a 24-hour reply window. Templates are submitted to Meta for review — typically approved within 24–48 hours for marketing templates, faster for utility templates. They can include text, images, buttons, and variable fields for personalisation. Once approved, you can send them to any opted-in contact." },
      { question: "Is WhatsApp marketing legal and does it require consent?", answer: "Yes — with proper consent collection. WhatsApp requires explicit opt-in before you can send any marketing message. Opt-in must specifically mention WhatsApp communication (a general marketing consent checkbox is not sufficient). In most markets, data protection laws (GDPR in Europe, various national laws elsewhere) also require consent records and immediate honouring of opt-out requests." },
    ],
  },
```

- [ ] **Step 2: Run the test — confirm "has at least 8 posts total" now passes, global post 1 passes**

```bash
pnpm --filter @WBMSG/conveys test -- --reporter=verbose posts.test
```

Expected: "global posts exist" still fails (posts 2 and 3 missing), "has at least 8 posts total" still fails (6 posts now, need 8).

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/blog/data/posts.ts
git commit -m "feat(conveys): add global blog post — WhatsApp CRM for small business"
```

---

## Task 10: Add global blog post 2 — SaaS product development

**Files:**
- Modify: `apps/conveys/app/blog/data/posts.ts`

- [ ] **Step 1: Append the post to BLOG_POSTS**

After the post added in Task 9, append:

```ts
  {
    slug: "saas-product-development-cost-timeline",
    title: "Building a SaaS Product: Realistic Cost, Timeline & Tech Stack (2025)",
    description:
      "Everything founders and product teams need to know about building a SaaS product — realistic costs, phase-by-phase timelines, recommended tech stack, and the mistakes that kill early-stage products.",
    publishedAt: "2026-06-09",
    category: "SaaS Development",
    readingTime: "9 min read",
    intro:
      "The global SaaS market exceeded $197 billion in 2023 and continues to grow. Thousands of founders are building SaaS products right now — and most of them are making the same expensive mistakes. This guide gives you a realistic picture of what building a SaaS product actually costs, how long it takes, and what technical decisions matter most in the early stages.",
    sections: [
      { type: "h2", text: "What Makes SaaS Different from Regular Software" },
      { type: "p", text: "SaaS (Software as a Service) delivers software over the internet on a subscription model. Unlike custom software built for one client, a SaaS product serves many customers simultaneously from shared infrastructure. This requires multi-tenancy, self-serve onboarding, subscription billing, and user management from day one — which is why SaaS projects always take longer and cost more than founders expect." },
      { type: "h2", text: "Phase 1: Discovery & Product Definition (Weeks 1–3)" },
      { type: "ul", items: [
        "User research: interview 10–15 target customers about their current workflow and what they would pay to fix",
        "Competitor analysis: what tools exist today, why are they insufficient, and what is your differentiation?",
        "MVP feature set: the 3–5 features that define your core value proposition — everything else is post-launch",
        "Architecture decision: monolith first (microservices is premature at MVP stage)",
        "Multi-tenancy strategy: shared database with row-level security is correct for 95% of SaaS products",
        "Integration map: decide which third-party services you will depend on — payment, email, authentication",
      ]},
      { type: "h2", text: "Phase 2: Design (Weeks 3–6)" },
      { type: "ul", items: [
        "Wireframes: low-fidelity user flows reviewed by 3–5 target users before visual design begins",
        "UI design in Figma: high-fidelity screens with your brand, typography, colour palette, and component library",
        "Design system: shared components to keep the product visually consistent as it grows",
        "Prototype testing: clickable prototype reviewed by target users — cheaper to fix design issues here than in code",
      ]},
      { type: "h2", text: "Phase 3: Development (Weeks 6–22 for MVP)" },
      { type: "p", text: "A complete SaaS MVP development phase covers:" },
      { type: "ul", items: [
        "Authentication: email/password, OAuth (Google/GitHub), organisation invitations, and role-based access control",
        "Core feature development: the primary reason customers will pay for your product",
        "Subscription billing: Stripe for global markets, with local payment integrations as needed",
        "Admin panel: internal dashboard to manage customers, view metrics, and debug issues",
        "API: REST or GraphQL if your product needs to integrate with other tools",
        "Infrastructure: CI/CD pipeline, staging environment, error monitoring (Sentry), uptime monitoring",
      ]},
      { type: "h2", text: "Realistic Cost Breakdown (USD)" },
      { type: "ul", items: [
        "Discovery (3 weeks): $1,500–$5,000",
        "Design (3 weeks, Figma): $2,000–$8,000",
        "MVP development (12–16 weeks): $15,000–$60,000 depending on complexity and dev team location",
        "Total MVP cost: $18,500–$73,000",
        "Full product (post-MVP, 6–12 months): $60,000–$200,000+",
        "Monthly hosting and infrastructure: $200–$2,000/month depending on load",
      ]},
      { type: "h2", text: "Recommended Tech Stack" },
      { type: "ul", items: [
        "Frontend: Next.js 15 (React) + TypeScript + Tailwind CSS — SSR for SEO, easy deployment to Vercel",
        "Backend: Node.js + Fastify or Express + TypeScript — fast, typed, shares language with frontend",
        "Database: PostgreSQL + Prisma ORM — relational, row-level security for multi-tenancy, excellent tooling",
        "Authentication: Clerk or Auth.js — handles sessions, OAuth, MFA, and org invitations",
        "Billing: Stripe — subscription management, invoicing, dunning, and webhook integration",
        "Hosting: Vercel (frontend) + Railway (backend) — easiest deployment path for early-stage products",
        "Monitoring: Sentry (errors) + Datadog or Grafana (performance)",
        "Email: Resend or Amazon SES",
      ]},
      { type: "h2", text: "The Mistakes That Kill Early-Stage SaaS" },
      { type: "ul", items: [
        "Over-building before validating: launch with 3 features, not 30 — real users teach you more in a week than 3 months of assumptions",
        "Ignoring multi-tenancy until too late: retrofitting tenant isolation into a single-tenant architecture is expensive and risky",
        "No staging environment: testing in production destroys customer trust and creates support fires",
        "Delaying billing integration: payment is harder than it looks — integrate Stripe in the MVP sprint, not sprint 9",
        "Building on a proprietary platform: always insist on owning the source code in a repository you control",
        "Skipping error monitoring: you will not know your product is broken until a customer tells you — Sentry costs $26/month and saves hours of debugging",
      ]},
    ],
    faqs: [
      { question: "How much does it cost to build a SaaS product?", answer: "An MVP with authentication, core features, and billing integration costs $18,500–$73,000 depending on complexity and the location of your development team. A full product with advanced features, mobile app, and enterprise integrations can cost $100,000–$300,000+. Ongoing maintenance and hosting adds $500–$5,000/month. These are development costs — marketing and customer acquisition are separate." },
      { question: "How long does it take to build a SaaS MVP?", answer: "3–5 months: 3 weeks discovery, 3 weeks design, 12–16 weeks development. Most founders underestimate this by 2× because they do not account for product definition, design, QA, deployment configuration, and billing integration. We strongly recommend launching at 4–5 months with an MVP rather than waiting 12 months for a 'complete' product — real user feedback is worth more than speculative features." },
      { question: "What is multi-tenancy and do I need it from day one?", answer: "Multi-tenancy means multiple customers share the same application infrastructure with their data logically isolated. Yes — you need it from day one. Retrofitting tenant isolation later is one of the most expensive architectural mistakes in SaaS. Use a shared PostgreSQL database with row-level security (RLS): fast to build, secure, and scales to millions of rows per tenant without separate database instances." },
      { question: "Stripe or another payment processor for my SaaS?", answer: "Stripe for almost everything. It handles subscription management, invoicing, metered billing, dunning (failed payment recovery), and tax compliance better than any competitor. The developer experience is excellent and the documentation is best-in-class. Add local payment processors for specific markets only when your customer base demands it." },
      { question: "Should I build a SaaS as a monolith or microservices?", answer: "Monolith first, always. Microservices add operational complexity (service discovery, distributed tracing, network latency) that is expensive to manage when your priority is shipping quickly. A well-structured monolith with clear module boundaries can be split into services later when you have the traffic and team size to justify it. Most SaaS companies at $1M–$5M ARR run a monolith successfully." },
    ],
  },
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @WBMSG/conveys test -- --reporter=verbose posts.test
```

Expected: "global posts exist" still partially fails (post 3 missing), "has at least 8 posts total" still fails (7 posts).

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/blog/data/posts.ts
git commit -m "feat(conveys): add global blog post — SaaS product development cost and timeline"
```

---

## Task 11: Add global blog post 3 — Cross-platform vs native

**Files:**
- Modify: `apps/conveys/app/blog/data/posts.ts`

- [ ] **Step 1: Append the post to BLOG_POSTS**

After the post added in Task 10, append:

```ts
  {
    slug: "cross-platform-vs-native-app-development",
    title: "Cross-Platform vs Native App Development: Which Should You Choose? (2025)",
    description:
      "A practical comparison of native iOS/Android development against React Native and Flutter — performance, cost, timelines, and a decision framework for product teams and founders.",
    publishedAt: "2026-06-09",
    category: "Mobile App Development",
    readingTime: "7 min read",
    intro:
      "Every mobile product decision starts with the same question: build native for each platform, or use a cross-platform framework that covers both? The answer affects your budget, timeline, team composition, and long-term maintenance burden. This guide gives you a decision framework based on your specific product requirements.",
    sections: [
      { type: "h2", text: "The Four Options" },
      { type: "ul", items: [
        "Native iOS (Swift): built specifically for Apple's platform, maximum performance and OS integration, iOS users only",
        "Native Android (Kotlin): built specifically for Android, maximum performance and OS integration, Android users only",
        "Both native: two separate codebases, maximum platform fidelity, highest cost and longest timeline",
        "Cross-platform (React Native or Flutter): one codebase, both platforms, lower cost, small performance trade-off",
      ]},
      { type: "h2", text: "Native iOS Development" },
      { type: "p", text: "Native iOS apps are written in Swift using Xcode. They have access to every Apple API and follow Apple's Human Interface Guidelines — which means apps feel exactly right to iPhone users." },
      { type: "ul", items: [
        "Best for: apps requiring ARKit, HealthKit, on-device ML, custom camera pipelines, or where Apple's security model is a core feature",
        "Cost: $15,000–$50,000 for a full-featured app (iOS only)",
        "Timeline: 10–18 weeks",
        "Limitation: iOS-only; a separate project is needed for Android",
        "App Store review: 1–7 days; Apple uses human reviewers who can reject for policy violations",
      ]},
      { type: "h2", text: "Native Android Development" },
      { type: "p", text: "Native Android apps are written in Kotlin with Jetpack Compose for modern UIs. Android holds approximately 72% global smartphone market share — though in premium markets like North America and Western Europe, iOS has comparable or higher share." },
      { type: "ul", items: [
        "Best for: apps targeting mass-market audiences or requiring deep Android system integration",
        "Cost: $15,000–$50,000 for a full-featured app (Android only)",
        "Timeline: 10–18 weeks",
        "Limitation: Android-only; device fragmentation requires testing across many screen sizes",
        "Play Store review: 1–3 days, mostly automated",
      ]},
      { type: "h2", text: "React Native (Cross-Platform)" },
      { type: "p", text: "React Native uses JavaScript/TypeScript to render native UI components on both iOS and Android. It powers production apps at Meta, Shopify, Discord, and thousands of startups. The 2023 new architecture (JSI + Fabric) closed most of the performance gap with native." },
      { type: "ul", items: [
        "Best for: B2B tools, marketplaces, booking platforms, CRMs, e-commerce — anything where 95% of features are standard UI",
        "Code sharing: 70–85% of logic shared; platform-specific UI handled per-platform when needed",
        "Cost: $20,000–$65,000 for both iOS and Android (vs $30,000–$100,000 for two native apps)",
        "Timeline: 10–16 weeks for both platforms",
        "Limitation: 5–10% performance gap vs native for CPU-intensive tasks; some platform-specific UI patterns need custom work",
      ]},
      { type: "h2", text: "Flutter (Cross-Platform)" },
      { type: "p", text: "Flutter uses Dart and renders its own UI components rather than native ones. This gives pixel-perfect visual consistency across platforms but means the app does not automatically look or feel like a native app." },
      { type: "ul", items: [
        "Best for: apps where visual consistency and custom animations matter more than native UI conventions",
        "Code sharing: 90–95% across iOS, Android, and web",
        "Cost: similar to React Native",
        "Timeline: similar to React Native",
        "Limitation: Dart ecosystem is smaller than JavaScript; fewer third-party integrations for some regional services",
      ]},
      { type: "h2", text: "Cost Comparison" },
      { type: "ul", items: [
        "Native iOS only: $15,000–$50,000",
        "Native Android only: $15,000–$50,000",
        "Both native (separate): $30,000–$100,000",
        "React Native (both platforms): $20,000–$65,000",
        "Flutter (both platforms + web): $20,000–$65,000",
        "Backend API (required for most apps): $10,000–$25,000 additional",
      ]},
      { type: "h2", text: "Decision Framework" },
      { type: "ul", items: [
        "Your app uses ARKit, HealthKit, on-device ML, or custom camera pipelines → Native",
        "You need 60fps animations and real-time audio/video → Native",
        "You need both iOS and Android within 4–5 months → Cross-platform",
        "Your team already knows JavaScript/TypeScript → React Native",
        "Visual consistency and pixel-perfect custom UI matter most → Flutter",
        "You are building a B2B tool, booking app, CRM, or marketplace → Cross-platform",
      ]},
    ],
    faqs: [
      { question: "Is React Native good enough for a production app?", answer: "Yes, for the vast majority of app types. React Native powers Facebook (partially), Shopify, Discord, and thousands of production apps. The 2023 new architecture (JSI + Fabric) eliminated the JavaScript bridge bottleneck that caused performance issues in older versions. The 5–10% performance gap vs native only matters for apps with heavy real-time graphics, on-device ML, or AR. For B2B tools, delivery apps, booking platforms, and CRMs, React Native is production-ready." },
      { question: "Which platform should I build for first?", answer: "It depends on where your target users are. Android has 72% global market share but iOS has majority share in North America, the UK, Japan, and Australia — and iOS users tend to have higher average spending. If you use React Native or Flutter, you cover both from day one. If you must choose one: research your specific target demographic before deciding, not just global averages." },
      { question: "How long does app store review take?", answer: "Google Play: 1–3 days for new apps. Apple App Store: 1–7 days; Apple uses human reviewers who can reject for policy violations and request additional information — plan for a 2-week buffer before your target launch date. Both stores review updates faster than new submissions: typically hours to 2 days." },
      { question: "Can I start with one platform and add the other later?", answer: "Yes, but it is much more efficient to start with a cross-platform framework from the beginning than to build native for one platform and rebuild for the other later. If you start native iOS, adding Android later means rebuilding in Kotlin — not porting. React Native lets you start with an iOS-focused development workflow and add Android with minimal additional work, since it is the same codebase." },
      { question: "What should a minimum viable mobile app include?", answer: "An MVP should have: authentication, the single core feature your app is built around, a working backend API, and basic analytics. Strip everything else. The features users ask for before launch are not the same as the features they actually use after launch. Most successful apps launched with a fraction of their current feature set and iterated based on real usage data." },
    ],
  },
```

- [ ] **Step 2: Run all tests — confirm all pass**

```bash
pnpm --filter @WBMSG/conveys test -- --reporter=verbose posts.test
```

Expected: ALL tests pass:
- "all posts have required fields" — PASS (8 posts, all valid)
- "global posts exist with no 'india' in slug or description" — PASS
- "has at least 8 posts total" — PASS (8 posts)

- [ ] **Step 3: Commit**

```bash
git add apps/conveys/app/blog/data/posts.ts
git commit -m "feat(conveys): add global blog post — cross-platform vs native app development"
```

---

## Task 12: Full build verification

- [ ] **Step 1: Run the full test suite for conveys**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: all tests pass including rate-limit, mail, contact route, and posts.

- [ ] **Step 2: Run production build**

```bash
pnpm --filter @WBMSG/conveys build
```

Expected: build completes with no TypeScript errors. Note the number of static pages generated — should be higher than before due to 3 new blog posts and all service pages.

- [ ] **Step 3: Verify no India refs remain in key metadata files**

```bash
grep -rn "en_IN\|lang=\"en-IN\"\|India" apps/conveys/app/layout.tsx apps/conveys/components/service-page.tsx apps/conveys/app/services/whatsapp-crm/page.tsx apps/conveys/app/services/\[slug\]/page.tsx
```

Expected: zero matches.

- [ ] **Step 4: Verify sitemap includes all 8 blog posts**

```bash
grep -c "blog/" apps/conveys/.next/server/app/sitemap.xml 2>/dev/null || echo "Check sitemap at https://conveys.in/sitemap.xml after deploy"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(conveys): verified build — global SEO overhaul complete"
```

---

## Post-Deploy Checklist (manual, after Vercel deploy)

- [ ] Visit `https://conveys.in` → view-source → confirm `<html lang="en">` (not `en-IN`)
- [ ] Visit `https://conveys.in` → view-source → confirm `"en_US"` in OG locale
- [ ] Visit `https://conveys.in` → view-source → confirm `hreflang="en"` link tag present
- [ ] Visit `https://conveys.in` → view-source → confirm Organization JSON-LD has `"name":"Worldwide"` in areaServed
- [ ] Visit `https://conveys.in/sitemap.xml` → confirm all 8 blog post URLs are listed
- [ ] Test in [Google Rich Results Test](https://search.google.com/test/rich-results) with `https://conveys.in/blog/whatsapp-crm-for-small-business` — confirm FAQPage schema detected
- [ ] Submit updated sitemap in GSC → Index → Sitemaps → `https://conveys.in/sitemap.xml`
- [ ] Request indexing for the 3 new blog post URLs in GSC → URL Inspection
