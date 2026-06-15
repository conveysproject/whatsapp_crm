# GA4 Behavioral Tracking — conveys.in

**Date:** 2026-06-15
**Scope:** `apps/conveys` only
**Approach:** Option B — Full behavioral layer

---

## Context

conveys.in has GA4 loaded (G-4Q09E6BQC1) with automatic page views and a single `generate_lead` event on homepage form submit. `trackCTAClick()` exists in `lib/analytics.ts` but has zero callsites. All CTA buttons, phone/email links, blog engagement, and form micro-events are invisible.

Traffic is sparse (~4 organic clicks/month as of 2026-06-15 per GSC). Every visit matters — high fidelity tracking is needed now so history is clean when traffic grows. No paid campaigns, pure organic.

Goals: conversion funnel visibility, content performance, traffic/channel attribution.

---

## Architecture

### Constraint: Server Components

`app/blog/[slug]/page.tsx` and `components/service-page.tsx` are Server Components — no `useEffect` or event listeners. We solve this with two small Client Component wrappers:

- **`BlogScrollTracker`** — mounts invisibly in blog post pages, fires scroll milestones via `IntersectionObserver`
- **`TrackedLink`** — wraps `<a>` tags for phone/email links that need click events

Everything else (form tracking, homepage CTAs) lives in `conveys-home.tsx` which is already `"use client"`.

No new libraries. No GTM. All events go through the existing `window.gtag` wrapper in `lib/analytics.ts`.

---

## Event Taxonomy

| Event | Fires when | Parameters |
|---|---|---|
| `cta_click` | Any CTA button clicked | `label`, `destination`, `page_section` |
| `phone_click` | `tel:` link clicked | `label: "phone"`, `location` |
| `email_click` | `mailto:` link clicked | `label: "email"`, `location` |
| `service_card_click` | "Learn More" clicked on homepage service card | `service_name`, `destination` |
| `contact_form_start` | User focuses any form field for the first time | *(none)* |
| `contact_form_error` | API returns error on submit | `error_message` |
| `contact_form_abandon` | Form started but user left without submitting | `last_field_touched`, `service_selected` |
| `generate_lead` | Successful form submit *(already exists)* | `event_category: "contact"`, `event_label: <service>` |
| `blog_scroll` | Scroll milestone on blog post | `milestone` (25/50/75/90), `post_slug`, `post_title` |

**Deliberately excluded:** FAQ accordion opens, testimonial views, stats bar views, footer nav clicks — too noisy or not actionable.

---

## Files Changed

### Modified

**`apps/conveys/lib/analytics.ts`**
Update existing function:
- `trackCTAClick(label: string, destination: string, pageSection?: string)` — add optional third param; backwards compatible

Add seven new exported functions:
- `trackPhoneClick(location: string)` — fires `phone_click`
- `trackEmailClick(location: string)` — fires `email_click`
- `trackServiceCardClick(serviceName: string, destination: string)` — fires `service_card_click`
- `trackFormStart()` — fires `contact_form_start`
- `trackFormError(errorMessage: string)` — fires `contact_form_error`
- `trackFormAbandon(lastField: string, serviceSelected: string)` — fires `contact_form_abandon`
- `trackBlogScroll(milestone: number, postSlug: string, postTitle: string)` — fires `blog_scroll`

---

**`apps/conveys/components/conveys-home.tsx`**

CTA callsites to wire:
- Hero "Start a Project" → `trackCTAClick("Start a Project", "#contact", "hero")`
- Hero "See Our Services" → `trackCTAClick("See Our Services", "#services", "hero")`
- Mid-banner "Book a Free Call" → `trackCTAClick("Book a Free Call", "#contact", "mid-banner")`
- "Why Conveys" / "Work With Us" → `trackCTAClick("Work With Us", "#contact", "why-us")`
- Each service card "Learn More" → `trackServiceCardClick(service.label, service.href)`

Phone/email:
- `tel:+919907072035` → `trackPhoneClick("homepage")`
- `mailto:info@conveys.in` → `trackEmailClick("homepage")`

Form micro-events:
- First field focus → `trackFormStart()` (guarded by a `hasStarted` ref so it only fires once)
- API error → `trackFormError(errorMsg)`
- Page unload while form started and not yet submitted → `trackFormAbandon(lastField, form.service)` via `beforeunload` listener

---

**`apps/conveys/components/conveys-footer.tsx`**

Replace bare `<a href="tel:...">` and `<a href="mailto:...">` with `<TrackedLink>` passing `phone_click`/`email_click` with `location: "footer"`.

---

**`apps/conveys/components/service-page.tsx`**

The CTA section renders a `<Link href="/#contact">` button. Replace it with a `<TrackedServiceCTA slug={data.slug} title={data.title} />` Client Component that calls `trackCTAClick(data.title, "/#contact", "service-page")` on click.

---

**`apps/conveys/app/blog/[slug]/page.tsx`**

After the article body, drop in:
```tsx
<BlogScrollTracker postSlug={post.slug} postTitle={post.title} />
```
This is a Server Component file so `BlogScrollTracker` must be imported as a Client Component.

---

### New Files

**`apps/conveys/components/blog-scroll-tracker.tsx`** (`"use client"`)

Mounts a `scroll` event listener on `window` inside `useEffect`. On each scroll event, calculates scroll percentage as `window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)`. Fires `trackBlogScroll(milestone, postSlug, postTitle)` once per milestone (25, 50, 75, 90). Renders `null` — no visible output.

Implementation notes:
- Track fired milestones in a `useRef<Set<number>>` to prevent duplicate fires
- Remove the scroll listener in the `useEffect` cleanup function
- Guard against division by zero (page shorter than viewport)

---

**`apps/conveys/components/tracked-link.tsx`** (`"use client"`)

Exports two components:

`TrackedLink` — minimal client wrapper for phone/email `<a>` tags:
```tsx
interface TrackedLinkProps {
  href: string
  onTrack: () => void
  className?: string
  children: ReactNode
}
```
Renders a plain `<a>` tag. Calls `onTrack()` on click before the browser follows the href.

`TrackedServiceCTA` — client button used in `service-page.tsx`. Calls `trackCTAClick(title, "/#contact", "service-page")` on click then navigates via `router.push("/#contact")`. Accepts `title: string` prop.

---

## GA4 Dashboard Steps (one-time, not code)

1. **Mark `generate_lead` as a Conversion** — GA4 → Admin → Events → find `generate_lead` → toggle "Mark as conversion"
2. **Enable Enhanced Measurement** — GA4 → Admin → Data Streams → your stream → Enhanced Measurement → turn on. This auto-captures outbound link clicks and additional scroll signals on top of our custom events.

---

## What This Does NOT Change

- GA4 measurement ID (`G-4Q09E6BQC1`) — no change
- Microsoft Clarity setup — no change
- `generate_lead` event signature — no change (backwards compatible)
- Any page layouts, styles, or SEO metadata
- No new npm dependencies
