# Services Mega Menu & 26 Service Pages — Design Spec
**Date:** 2026-05-20  
**Project:** conveys.in marketing site (`apps/conveys`)  
**Status:** Approved — revised implementation order

## Implementation Order (REVISED)

Build infrastructure first, then add page data one by one:

**Phase 1 — Infrastructure (do first):**
1. `apps/conveys/lib/services-data.ts` — type definitions + `SERVICES` array with slugs/titles/columns only (no full page data yet); `getService()` helper
2. `apps/conveys/components/service-page.tsx` — full template component (Hero, Offerings, Process, TechStack, FAQ, Related, CTA)
3. `apps/conveys/components/services-mega-menu.tsx` — 4-column dropdown panel
4. Update `apps/conveys/components/conveys-header.tsx` — replace Services link with mega menu
5. Update `apps/conveys/components/conveys-footer.tsx` — 26-service grouped links
6. Update `apps/conveys/app/sitemap.ts` — all 26 slugs

**Phase 2 — Pages (one at a time, ask user which to do next):**
- For each service: fill in full `ServiceData` in services-data.ts, then create `apps/conveys/app/services/{slug}/page.tsx`
- Start with the 4 existing pages (web-development, mobile-app-development, whatsapp-crm, ai-solutions)
- Then add the 22 new pages on demand

**Phase 2 Progress:**
| # | Slug | Status |
|---|------|--------|
| 1 | `web-development` | ✅ Done |
| 2 | `mobile-app-development` | ✅ Done |
| 3 | `whatsapp-crm` | ✅ Done |
| 4 | `ai-solutions` | ✅ Done |
| 5 | `site-migration` | ✅ Done (2026-05-22) |
| 6 | `cloud-infrastructure-setup` | ✅ Done (2026-05-22) |
| 7 | `whatsapp-business-api` | ✅ Done (2026-05-22) |
| 8 | `cloud-architecture-review` | ✅ Done (2026-05-22) |
| 9 | `devops-cicd` | ✅ Done (2026-05-22) |
| 10 | `database-administration` | ✅ Done (2026-05-22) |
| 11 | `native-app-development` | ✅ Done (2026-05-22) |
| 12 | `custom-software-development` | ✅ Done (2026-05-22) |
| 13 | `cross-platform-development` | ✅ Done (2026-05-22) |
| 14 | `iot-development` | ✅ Done (2026-05-22) |
| 15 | `ui-ux-design` | ✅ Done (2026-05-22) |
| 16 | `frontend-development` | ✅ Done (2026-05-22) |
| 17 | `backend-development` | ✅ Done (2026-05-22) |
| 18 | `digital-transformation` | ✅ Done (2026-05-22) |
| 19 | `managed-it-services` | ✅ Done (2026-05-22) |
| 20 | `digital-marketing` | ✅ Done (2026-05-22) |
| 21 | `whatsapp-marketing-automation` | ✅ Done (2026-05-22) |
| 22 | `crm-integration` | ✅ Done (2026-05-22) |
| 23 | `managed-service-provider` | ✅ Done (2026-05-22) |
| 24 | `saas-product-development` | ✅ Done (2026-05-22) |
| 25 | `mvp-development` | ✅ Done (2026-05-22) |
| 26 | `api-integration-development` | ✅ Done (2026-05-22) |
| 27 | `ecommerce-solutions` | ✅ Done (2026-05-22) |
| 28 | `b2b-platform-design` | ✅ Done (2026-05-22) |
| 29 | `whatsapp-commerce` | ✅ Done (2026-05-22) |

---

---

## 1. Overview

Replace the current "Services" nav link (`/#services`) with a 4-column mega menu dropdown. Each of the 26 service items links to its own dedicated Next.js page with unique SEO-optimised content. All pages (including the 4 existing ones) share a single `ServicePage` template component driven by a `services-data.ts` data file.

**Goals:**
- Match the visual style of appsquadz.com mega menu (icon + name list, category headers, white panel)
- 26 individual service URLs for maximum SEO surface area
- 100% Google SEO compliance on every page (title, meta, canonical, JSON-LD x2, OG, breadcrumb)
- India-SMB-focused copywriting throughout

---

## 2. Complete Service List

### Column 1 — Cloud Services
| Slug | Title |
|---|---|
| `site-migration` | Site Migration |
| `cloud-infrastructure-setup` | Cloud Infrastructure Setup |
| `whatsapp-business-api` | WhatsApp Business API Setup |
| `cloud-architecture-review` | Cloud Architecture Review |
| `devops-cicd` | DevOps & CI/CD |
| `database-administration` | Database Administration |

### Column 2 — IT Software Consultancy
| Slug | Title |
|---|---|
| `mobile-app-development` | Mobile App Development *(existing — migrate to template)* |
| `native-app-development` | Native App Development |
| `custom-software-development` | Custom Software Development |
| `cross-platform-development` | Cross Platform Development |
| `iot-development` | IoT Development |
| `ui-ux-design` | UI & UX Designing |
| `frontend-development` | Frontend Development |
| `backend-development` | Backend Development |
| `web-development` | Web Development *(existing — migrate to template)* |

### Column 3 — Digital & IT Solutions
| Slug | Title |
|---|---|
| `digital-transformation` | Digital Transformation |
| `managed-it-services` | Managed IT Services |
| `digital-marketing` | Digital Marketing Services |
| `whatsapp-marketing-automation` | WhatsApp Marketing Automation |
| `crm-integration` | CRM Integration & Setup |
| `managed-service-provider` | Managed Service Provider |
| `whatsapp-crm` | WhatsApp CRM *(existing — migrate to template)* |
| `ai-solutions` | AI Solutions *(existing — migrate to template)* |

### Column 4 — Product Development
| Slug | Title |
|---|---|
| `saas-product-development` | SaaS Product Development |
| `mvp-development` | MVP Development |
| `api-integration-development` | API & Integration Development |
| `ecommerce-solutions` | E-commerce Solutions |
| `b2b-platform-design` | B2B Platform Design |
| `whatsapp-commerce` | WhatsApp Commerce Solutions |

**Total: 26 pages** (22 new + 4 existing migrated)

---

## 3. Mega Menu Component

### Trigger
- Desktop: hover over "Services" nav item opens the panel
- Keyboard: focus + Enter/Space opens, Escape closes
- Mobile: "Services" item in accordion expands to show 4 collapsible sub-sections

### Panel Layout
- Full-width white card, `shadow-xl`, `rounded-2xl`, drops below the sticky header
- 4 equal columns (`grid-cols-4`), separated by subtle dividers
- Each column:
  - Category header: bold label + left-aligned decorative horizontal rule in blue-700
  - List of items: `[Icon] Service Name` — icon is a 20×20 Lucide icon in blue-100 bg circle, name in slate-700
  - Hover state: item background blue-50, name text blue-700
- Panel closes on: outside click, Escape key, any item click

### Files to create/modify
- **Modify:** `apps/conveys/components/conveys-header.tsx` — replace Services link with mega menu
- **Create:** `apps/conveys/components/services-mega-menu.tsx` — the dropdown panel (client component)

### Mobile behaviour
In the existing mobile nav (`#conveys-mobile-nav`), replace the Services link with an accordion button. Tapping expands to show 4 sections, each with their service items as links. Tapping a service navigates and closes the mobile nav.

---

## 4. Service Page Template

### Component
**File:** `apps/conveys/components/service-page.tsx`  
A single React component that accepts a `ServiceData` prop and renders all sections. Used by every service page.

### Data File
**File:** `apps/conveys/lib/services-data.ts`  
Exports the `SERVICES` array and a `getService(slug)` helper. Each entry:

```ts
type ServiceData = {
  slug: string;
  column: "Cloud Services" | "IT Software Consultancy" | "Digital & IT Solutions" | "Product Development";
  title: string;
  tagline: string;            // H1 — punchy, keyword-rich, ≤ 60 chars
  metaTitle: string;          // ≤ 60 chars — "{Service} in India | Conveys"
  metaDescription: string;    // 150–160 chars, includes primary keyword + CTA
  overview: string[];         // 2–3 paragraphs for the Overview section
  offerings: {
    title: string;
    description: string;      // 2 sentences, includes LSI keywords
    icon: LucideIcon;
  }[];                        // exactly 6 items
  process: {
    step: string;             // "01"–"05"
    title: string;
    duration: string;
    body: string;
  }[];                        // exactly 5 items
  techStack: {
    name: string;
    category: string;
  }[];                        // 8–12 items relevant to the service
  faqs: {
    q: string;
    a: string;                // ≥ 60 words, includes primary or LSI keyword
  }[];                        // exactly 5 items
  relatedSlugs: string[];     // 3 slugs for internal linking at page bottom
};
```

### Page Template Sections (in order)

1. **Hero** (`bg-slate-900`) — H1 tagline, overview paragraph, "Get a Free Quote →" + "See Our Process" CTAs, decorative SVG illustration (reuse pattern from web-development page)
2. **Breadcrumb** — visible `Home / Services / {title}`, also in JSON-LD BreadcrumbList
3. **Key Offerings** — 6-card grid (icon + title + description), same card style as existing pages
4. **Our Process** — 5-step grid on dark background, numbered cards with duration badge
5. **Tech Stack** — pill tags (name + category)
6. **FAQ** — 5 `<details>` accordion items
7. **Related Services** — "You might also need" — 3 cards linking to `relatedSlugs`
8. **CTA Banner** — `bg-blue-700`, "Ready to get started?" + "Get a Free Quote" button

### Individual Page Files
Each service gets `apps/conveys/app/services/{slug}/page.tsx`:

```ts
import { getService } from "@/lib/services-data";
import { ServicePage } from "@/components/service-page";

export function generateMetadata() { /* from services-data */ }
export default function Page() {
  return <ServicePage data={getService("devops-cicd")} />;
}
```

---

## 5. SEO Implementation (every page)

### Metadata (Next.js `generateMetadata`)
```ts
{
  title: data.metaTitle,                          // ≤ 60 chars
  description: data.metaDescription,             // 150–160 chars
  alternates: { canonical: `https://conveys.in/services/${data.slug}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: data.metaTitle,
    description: data.metaDescription,
    url: `https://conveys.in/services/${data.slug}`,
    siteName: "Conveys",
    locale: "en_IN",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: data.metaTitle },
}
```

### JSON-LD (two schemas per page)
1. **Service** — `name`, `provider` → `https://conveys.in/#organization`, `areaServed` → India, `description`, `url`
2. **FAQPage** — all 5 FAQ items (Google FAQ rich results)
3. **BreadcrumbList** — Home → Services → {title}

### On-page SEO rules
- H1 contains primary keyword (from `tagline`)
- First `<p>` in Overview contains primary keyword
- At least 2 H2 headings contain primary or LSI keywords
- All images have descriptive `alt` text
- Each page internally links to 3 related service pages via `relatedSlugs`

---

## 6. Sitemap Update

**File:** `apps/conveys/app/sitemap.ts`  
Add all 22 new service slugs with:
```ts
{ url: `https://conveys.in/services/${slug}`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 }
```
Existing 4 service pages already in sitemap — update their entries to match `priority: 0.8`.

---

## 7. Footer Update

**File:** `apps/conveys/components/conveys-footer.tsx`  
Replace the current hardcoded 4-item services list with links to all 26 service pages, grouped by column (or limit to 8 representative links if the footer becomes too long).

---

## 8. Files Summary

| Action | File |
|---|---|
| Modify | `apps/conveys/components/conveys-header.tsx` |
| Create | `apps/conveys/components/services-mega-menu.tsx` |
| Create | `apps/conveys/components/service-page.tsx` |
| Create | `apps/conveys/lib/services-data.ts` |
| Create (×22) | `apps/conveys/app/services/{slug}/page.tsx` |
| Migrate (×4) | `apps/conveys/app/services/{web-development,mobile-app-development,whatsapp-crm,ai-solutions}/page.tsx` |
| Modify | `apps/conveys/app/sitemap.ts` |
| Modify | `apps/conveys/components/conveys-footer.tsx` |

**Total new files: 27** (1 mega menu + 1 template + 1 data file + 22 new pages + 2 modified components + 1 sitemap)
