# GA4 Behavioral Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire full behavioral tracking on conveys.in — CTA clicks, phone/email clicks, contact form micro-events, and blog scroll milestones — so every meaningful user interaction is visible in GA4.

**Architecture:** Extend `lib/analytics.ts` with new tracking functions, create two small Client Component wrappers (`BlogScrollTracker`, `TrackedLink`/`TrackedServiceCTA`) to handle scroll and click tracking inside Server Components, then wire callsites across `conveys-home.tsx`, `conveys-footer.tsx`, `service-page.tsx`, and `blog/[slug]/page.tsx`.

**Tech Stack:** Next.js 15 App Router (Server + Client Components), TypeScript strict, Vitest (node environment), `window.gtag` (GA4 already loaded in layout.tsx)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/conveys/lib/analytics.ts` | Modify | Add 7 new tracking functions; update `trackCTAClick` signature |
| `apps/conveys/lib/analytics.test.ts` | Create | Unit tests for all analytics functions |
| `apps/conveys/components/blog-scroll-tracker.tsx` | Create | Client component — fires `blog_scroll` at 25/50/75/90% scroll milestones |
| `apps/conveys/components/tracked-link.tsx` | Create | Client component — `TrackedLink` for phone/email anchors; `TrackedServiceCTA` for service page CTA |
| `apps/conveys/components/conveys-home.tsx` | Modify | Wire all CTA clicks, phone/email clicks, form start/error/abandon |
| `apps/conveys/components/conveys-footer.tsx` | Modify | Replace phone/email `<a>` tags with `<TrackedLink>` |
| `apps/conveys/components/service-page.tsx` | Modify | Replace `<Link href="/#contact">` CTA with `<TrackedServiceCTA>` |
| `apps/conveys/app/blog/[slug]/page.tsx` | Modify | Add `<BlogScrollTracker>` after article body |

---

## Task 1: Extend analytics.ts + write tests

**Files:**
- Modify: `apps/conveys/lib/analytics.ts`
- Create: `apps/conveys/lib/analytics.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `apps/conveys/lib/analytics.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackCTAClick,
  trackPhoneClick,
  trackEmailClick,
  trackServiceCardClick,
  trackFormStart,
  trackFormError,
  trackFormAbandon,
  trackBlogScroll,
} from "./analytics";

describe("analytics", () => {
  let mockGtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGtag = vi.fn();
    vi.stubGlobal("window", { gtag: mockGtag });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("trackCTAClick", () => {
    it("includes page_section when provided", () => {
      trackCTAClick("Start a Project", "#contact", "hero");
      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        event_category: "engagement",
        event_label: "Start a Project",
        destination: "#contact",
        page_section: "hero",
      });
    });

    it("omits page_section when not provided", () => {
      trackCTAClick("Start a Project", "#contact");
      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        event_category: "engagement",
        event_label: "Start a Project",
        destination: "#contact",
      });
    });
  });

  it("trackPhoneClick fires phone_click with location", () => {
    trackPhoneClick("homepage");
    expect(mockGtag).toHaveBeenCalledWith("event", "phone_click", {
      label: "phone",
      location: "homepage",
    });
  });

  it("trackEmailClick fires email_click with location", () => {
    trackEmailClick("footer");
    expect(mockGtag).toHaveBeenCalledWith("event", "email_click", {
      label: "email",
      location: "footer",
    });
  });

  it("trackServiceCardClick fires service_card_click", () => {
    trackServiceCardClick("Mobile App Development", "/services/mobile-app-development");
    expect(mockGtag).toHaveBeenCalledWith("event", "service_card_click", {
      service_name: "Mobile App Development",
      destination: "/services/mobile-app-development",
    });
  });

  it("trackFormStart fires contact_form_start with no params", () => {
    trackFormStart();
    expect(mockGtag).toHaveBeenCalledWith("event", "contact_form_start", undefined);
  });

  it("trackFormError fires contact_form_error with message", () => {
    trackFormError("Rate limit exceeded");
    expect(mockGtag).toHaveBeenCalledWith("event", "contact_form_error", {
      error_message: "Rate limit exceeded",
    });
  });

  it("trackFormAbandon fires contact_form_abandon with field and service", () => {
    trackFormAbandon("email", "Web & App Development");
    expect(mockGtag).toHaveBeenCalledWith("event", "contact_form_abandon", {
      last_field_touched: "email",
      service_selected: "Web & App Development",
    });
  });

  it("trackBlogScroll fires blog_scroll with milestone and post info", () => {
    trackBlogScroll(50, "saas-product-development-india", "SaaS Product Development India");
    expect(mockGtag).toHaveBeenCalledWith("event", "blog_scroll", {
      milestone: 50,
      post_slug: "saas-product-development-india",
      post_title: "SaaS Product Development India",
    });
  });
});
```

- [ ] **Step 1.2: Run tests — verify they all fail**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: 9 test failures — functions don't exist yet or have wrong signatures.

- [ ] **Step 1.3: Implement the updated analytics.ts**

Replace the entire content of `apps/conveys/lib/analytics.ts`:

```typescript
declare global {
  // eslint-disable-next-line no-var
  var gtag: ((...args: unknown[]) => void) | undefined;
  // eslint-disable-next-line no-var
  var clarity: ((...args: unknown[]) => void) | undefined;
}

export function trackEvent(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
}

export function trackLead(service?: string): void {
  trackEvent("generate_lead", {
    event_category: "contact",
    event_label: service ?? "general",
  });
}

export function trackCTAClick(label: string, destination: string, pageSection?: string): void {
  trackEvent("cta_click", {
    event_category: "engagement",
    event_label: label,
    destination,
    ...(pageSection !== undefined ? { page_section: pageSection } : {}),
  });
}

export function trackPhoneClick(location: string): void {
  trackEvent("phone_click", { label: "phone", location });
}

export function trackEmailClick(location: string): void {
  trackEvent("email_click", { label: "email", location });
}

export function trackServiceCardClick(serviceName: string, destination: string): void {
  trackEvent("service_card_click", { service_name: serviceName, destination });
}

export function trackFormStart(): void {
  trackEvent("contact_form_start");
}

export function trackFormError(errorMessage: string): void {
  trackEvent("contact_form_error", { error_message: errorMessage });
}

export function trackFormAbandon(lastField: string, serviceSelected: string): void {
  trackEvent("contact_form_abandon", {
    last_field_touched: lastField,
    service_selected: serviceSelected,
  });
}

export function trackBlogScroll(milestone: number, postSlug: string, postTitle: string): void {
  trackEvent("blog_scroll", { milestone, post_slug: postSlug, post_title: postTitle });
}
```

- [ ] **Step 1.4: Run tests — verify all 9 pass**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: all 9 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add apps/conveys/lib/analytics.ts apps/conveys/lib/analytics.test.ts
git commit -m "feat(conveys): extend analytics.ts with CTA, form, and scroll tracking functions"
```

---

## Task 2: Create BlogScrollTracker component

**Files:**
- Create: `apps/conveys/components/blog-scroll-tracker.tsx`

- [ ] **Step 2.1: Create the component**

Create `apps/conveys/components/blog-scroll-tracker.tsx`:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { trackBlogScroll } from "@/lib/analytics";

interface BlogScrollTrackerProps {
  postSlug: string;
  postTitle: string;
}

const MILESTONES = [25, 50, 75, 90] as const;

export function BlogScrollTracker({ postSlug, postTitle }: BlogScrollTrackerProps): null {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    function handleScroll(): void {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = Math.round((window.scrollY / scrollable) * 100);
      for (const milestone of MILESTONES) {
        if (pct >= milestone && !firedRef.current.has(milestone)) {
          firedRef.current.add(milestone);
          trackBlogScroll(milestone, postSlug, postTitle);
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [postSlug, postTitle]);

  return null;
}
```

- [ ] **Step 2.2: Type-check**

```bash
pnpm type-check
```

Expected: no errors in `blog-scroll-tracker.tsx`.

- [ ] **Step 2.3: Commit**

```bash
git add apps/conveys/components/blog-scroll-tracker.tsx
git commit -m "feat(conveys): add BlogScrollTracker client component for blog scroll milestones"
```

---

## Task 3: Create TrackedLink and TrackedServiceCTA components

**Files:**
- Create: `apps/conveys/components/tracked-link.tsx`

- [ ] **Step 3.1: Create the component file**

Create `apps/conveys/components/tracked-link.tsx`:

```typescript
"use client";

import type { ReactNode, JSX } from "react";
import { trackCTAClick } from "@/lib/analytics";

interface TrackedLinkProps {
  href: string;
  onTrack: () => void;
  className?: string;
  children: ReactNode;
}

export function TrackedLink({ href, onTrack, className, children }: TrackedLinkProps): JSX.Element {
  return (
    <a href={href} className={className} onClick={() => onTrack()}>
      {children}
    </a>
  );
}

interface TrackedServiceCTAProps {
  title: string;
  className?: string;
  children: ReactNode;
}

export function TrackedServiceCTA({ title, className, children }: TrackedServiceCTAProps): JSX.Element {
  return (
    <a
      href="/#contact"
      className={className}
      onClick={() => trackCTAClick(title, "/#contact", "service-page")}
    >
      {children}
    </a>
  );
}
```

- [ ] **Step 3.2: Type-check**

```bash
pnpm type-check
```

Expected: no errors in `tracked-link.tsx`.

- [ ] **Step 3.3: Commit**

```bash
git add apps/conveys/components/tracked-link.tsx
git commit -m "feat(conveys): add TrackedLink and TrackedServiceCTA client components"
```

---

## Task 4: Wire conveys-home.tsx

**Files:**
- Modify: `apps/conveys/components/conveys-home.tsx`

This task wires: CTA click events (5 buttons), phone + email click events (2 links), form start/error/abandon micro-events, and `onFocus` tracking on all 5 form fields.

- [ ] **Step 4.1: Update imports at top of conveys-home.tsx**

Replace the existing import block (lines 1–6 of the file):

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import type { ChangeEvent, FormEvent, JSX } from "react";
import Link from "next/link";
import {
  trackCTAClick,
  trackEmailClick,
  trackFormAbandon,
  trackFormError,
  trackFormStart,
  trackLead,
  trackPhoneClick,
  trackServiceCardClick,
} from "@/lib/analytics";
```

- [ ] **Step 4.2: Add refs and beforeunload effect inside ConveysHome**

After the existing `useState` declarations (after `const [errorMsg, setErrorMsg] = useState("")`), add:

```typescript
const hasStarted = useRef(false);
const lastField = useRef("");

useEffect(() => {
  function handleBeforeUnload(): void {
    if (hasStarted.current && status !== "success") {
      trackFormAbandon(lastField.current, form.service);
    }
  }
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [status, form.service]);
```

- [ ] **Step 4.3: Add handleFocus function**

After the existing `handleChange` function, add:

```typescript
function handleFocus(fieldName: string): void {
  if (!hasStarted.current) {
    hasStarted.current = true;
    trackFormStart();
  }
  lastField.current = fieldName;
}
```

- [ ] **Step 4.4: Add trackFormError calls to handleSubmit**

In `handleSubmit`, update the error branches:

```typescript
async function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setStatus("loading");
  setErrorMsg("");
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) {
      setStatus("error");
      const msg = data.error ?? "Something went wrong, please try again.";
      setErrorMsg(msg);
      trackFormError(msg);
    } else {
      setStatus("success");
      trackLead(form.service);
    }
  } catch {
    const msg = "Network error. Please check your connection and try again.";
    setStatus("error");
    setErrorMsg(msg);
    trackFormError(msg);
  }
}
```

- [ ] **Step 4.5: Wire CTA buttons in JSX**

Find and update each CTA. The current file has these anchors — add `onClick` to each:

**Hero "Start a Project" (inside hero section):**
```tsx
<a
  href="#contact"
  className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
  onClick={() => trackCTAClick("Start a Project", "#contact", "hero")}
>
  Start a Project →
</a>
```

**Hero "See Our Services":**
```tsx
<a
  href="#services"
  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
  onClick={() => trackCTAClick("See Our Services", "#services", "hero")}
>
  See Our Services
</a>
```

**Mid-banner "Book a Free Call":**
```tsx
<a
  href="#contact"
  className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
  onClick={() => trackCTAClick("Book a Free Call", "#contact", "mid-banner")}
>
  Book a Free Call
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
</a>
```

**"Work With Us" Link (in Why Conveys section):**
```tsx
<Link
  href="/#contact"
  className="mt-8 inline-flex rounded-full bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800"
  onClick={() => trackCTAClick("Work With Us", "/#contact", "why-us")}
>
  Work With Us →
</Link>
```

**Service card "Learn More" Links (inside SERVICES.map):**
```tsx
<Link
  href={service.href}
  className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
  onClick={() => trackServiceCardClick(service.label, service.href)}
>
  Learn More
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
  </svg>
</Link>
```

- [ ] **Step 4.6: Wire phone and email links in contact section**

```tsx
<a
  href="mailto:info@conveys.in"
  className="block text-blue-100 hover:text-white"
  onClick={() => trackEmailClick("homepage")}
>
  info@conveys.in
</a>
```

```tsx
<a
  href="tel:+919907072035"
  className="block font-bold text-white hover:text-blue-200"
  onClick={() => trackPhoneClick("homepage")}
>
  +91 99070 72035
</a>
```

- [ ] **Step 4.7: Add onFocus to all 5 form fields**

Add `onFocus={() => handleFocus("name")}` to the name input, and so on for each field. The five fields and their `name` attribute values:

- `<input name="name" ...>` → `onFocus={() => handleFocus("name")}`
- `<input name="email" ...>` → `onFocus={() => handleFocus("email")}`
- `<input name="phone" ...>` → `onFocus={() => handleFocus("phone")}`
- `<select name="service" ...>` → `onFocus={() => handleFocus("service")}`
- `<textarea name="message" ...>` → `onFocus={() => handleFocus("message")}`

- [ ] **Step 4.8: Type-check**

```bash
pnpm type-check
```

Expected: no errors in `conveys-home.tsx`.

- [ ] **Step 4.9: Commit**

```bash
git add apps/conveys/components/conveys-home.tsx
git commit -m "feat(conveys): wire GA4 CTA, phone, email, and form micro-event tracking on homepage"
```

---

## Task 5: Wire conveys-footer.tsx

**Files:**
- Modify: `apps/conveys/components/conveys-footer.tsx`

- [ ] **Step 5.1: Add imports**

Add to the existing imports at the top of `apps/conveys/components/conveys-footer.tsx`:

```typescript
import { TrackedLink } from "@/components/tracked-link";
import { trackEmailClick, trackPhoneClick } from "@/lib/analytics";
```

- [ ] **Step 5.2: Replace email and phone anchors**

Find the Contact section in the footer (lines 58–67) and replace the two bare `<a>` tags:

```tsx
<p>
  <TrackedLink
    href="mailto:info@conveys.in"
    onTrack={() => trackEmailClick("footer")}
    className="transition hover:text-white"
  >
    info@conveys.in
  </TrackedLink>
</p>
<p>
  <TrackedLink
    href="tel:+919907072035"
    onTrack={() => trackPhoneClick("footer")}
    className="font-semibold text-white transition hover:text-blue-400"
  >
    +91 99070 72035
  </TrackedLink>
</p>
```

- [ ] **Step 5.3: Type-check**

```bash
pnpm type-check
```

Expected: no errors in `conveys-footer.tsx`.

- [ ] **Step 5.4: Commit**

```bash
git add apps/conveys/components/conveys-footer.tsx
git commit -m "feat(conveys): track phone and email clicks in footer"
```

---

## Task 6: Wire service-page.tsx

**Files:**
- Modify: `apps/conveys/components/service-page.tsx`

- [ ] **Step 6.1: Add import**

In `apps/conveys/components/service-page.tsx`, add to the existing imports:

```typescript
import { TrackedServiceCTA } from "@/components/tracked-link";
```

- [ ] **Step 6.2: Replace CTA Link with TrackedServiceCTA**

Find the CTA Banner section (lines 282–298) and replace the `<Link href="/#contact">` with `TrackedServiceCTA`:

```tsx
{/* ── CTA Banner ── */}
<section className="bg-blue-700 py-16">
  <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
    <h2 className="text-3xl font-extrabold text-white">Ready to Get Started?</h2>
    <p className="mt-3 text-base text-blue-200">
      Tell us about your project and we&apos;ll respond within 24 hours with a scoped proposal.
    </p>
    <div className="mt-8 flex flex-wrap justify-center gap-4">
      <TrackedServiceCTA
        title={data.title}
        className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
      >
        Get a Free Quote →
      </TrackedServiceCTA>
    </div>
  </div>
</section>
```

- [ ] **Step 6.3: Type-check**

```bash
pnpm type-check
```

Expected: no errors in `service-page.tsx`.

- [ ] **Step 6.4: Commit**

```bash
git add apps/conveys/components/service-page.tsx
git commit -m "feat(conveys): track CTA clicks on service pages"
```

---

## Task 7: Wire blog post page

**Files:**
- Modify: `apps/conveys/app/blog/[slug]/page.tsx`

- [ ] **Step 7.1: Add import**

In `apps/conveys/app/blog/[slug]/page.tsx`, add to the existing imports:

```typescript
import { BlogScrollTracker } from "@/components/blog-scroll-tracker";
```

- [ ] **Step 7.2: Add BlogScrollTracker to the page**

Inside `BlogPostPage`, after the closing `</div>` of the body sections (line ~166) and before the FAQ section, add:

```tsx
<BlogScrollTracker postSlug={post.slug} postTitle={post.title} />
```

The placement within `<main>` doesn't matter — the component renders `null` and attaches a window scroll listener. Place it directly after the body sections div for clarity:

```tsx
{/* Body sections */}
<div className="mt-8">
  {post.sections.map((section, i) => renderSection(section, i))}
</div>

<BlogScrollTracker postSlug={post.slug} postTitle={post.title} />

{/* FAQ */}
<section className="mt-16 border-t border-slate-100 pt-12">
```

- [ ] **Step 7.3: Type-check**

```bash
pnpm type-check
```

Expected: no errors in `blog/[slug]/page.tsx`.

- [ ] **Step 7.4: Commit**

```bash
git add apps/conveys/app/blog/[slug]/page.tsx
git commit -m "feat(conveys): add blog scroll milestone tracking"
```

---

## Task 8: Final verification

- [ ] **Step 8.1: Run all tests**

```bash
pnpm --filter @WBMSG/conveys test
```

Expected: all tests pass, no regressions.

- [ ] **Step 8.2: Run full type-check**

```bash
pnpm type-check
```

Expected: zero errors across all packages.

- [ ] **Step 8.3: Start the dev server and manually verify in GA4 DebugView**

```bash
pnpm --filter @WBMSG/conveys dev
```

Open `http://localhost:3001` in Chrome. In a separate tab, open GA4 → Admin → DebugView.

Check each event fires in DebugView:

| Action | Expected event in DebugView |
|---|---|
| Click "Start a Project" in hero | `cta_click` with `page_section: "hero"` |
| Click "Book a Free Call" in mid-banner | `cta_click` with `page_section: "mid-banner"` |
| Click "Learn More" on a service card | `service_card_click` with `service_name` |
| Click phone number | `phone_click` with `location: "homepage"` |
| Click email address | `email_click` with `location: "homepage"` |
| Focus first form field | `contact_form_start` |
| Submit form with error | `contact_form_error` |
| Fill form then close tab | `contact_form_abandon` |
| Navigate to `/blog/saas-product-development-india-cost-timeline` and scroll to 50% | `blog_scroll` with `milestone: 50` |
| Click phone in footer | `phone_click` with `location: "footer"` |
| Navigate to `/services/web-development` and click "Get a Free Quote" | `cta_click` with `page_section: "service-page"` |

- [ ] **Step 8.4: GA4 dashboard — mark generate_lead as conversion**

In GA4: Admin → Events → find `generate_lead` → toggle "Mark as conversion" to on.

- [ ] **Step 8.5: GA4 dashboard — enable Enhanced Measurement**

In GA4: Admin → Data Streams → your stream → Enhanced Measurement → toggle on.

This auto-captures outbound link clicks and additional scroll signals on top of the custom events added in this plan.

---

## What this does NOT change

- GA4 measurement ID (`G-4Q09E6BQC1`)
- Microsoft Clarity setup
- `generate_lead` event signature (backwards compatible — existing GA4 history preserved)
- Page layouts, styles, SEO metadata
- No new npm dependencies
