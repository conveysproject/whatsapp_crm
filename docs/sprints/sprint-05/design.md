# Sprint 5 — Web App Shell

## Sprint Goal
Build the consistent visual foundation — design tokens, core UI components, and navigation shell — so every subsequent sprint can ship polished, accessible UI without reinventing layout or styling decisions.

## What We're Building

- **Tailwind design system** — Brand color scale (green-based, matching WhatsApp's palette), extended spacing, typography. CSS custom properties for tokens that need runtime access. Configured in `tailwind.config.ts` + `globals.css`.
- **Core UI components** — Four building blocks used across all future features:
  - `Button` — primary/secondary/ghost/destructive variants, sm/md/lg sizes, disabled state
  - `Input` — controlled, with label + error message
  - `Badge` — green/yellow/red/blue/gray color variants for status display
  - `Toast` — Radix `@radix-ui/react-toast` for non-blocking notifications
- **Nav shell** — `Sidebar` (left, 240px) with route-aware active links + `TopBar` (top, 56px) with org name and Clerk `UserButton`. Together they form the persistent `(dashboard)/layout.tsx` chrome.
- **Dashboard home** — Stat cards (Open Conversations, Contacts, Messages Today, Pending Invitations). Values are placeholder `—` in Sprint 5; wired to real data in Sprint 11 (Analytics).
- **Contacts list page** — Server Component that fetches `GET /v1/contacts` using the Clerk token and renders a table with badge-coded lifecycle stage. Includes loading skeleton.
- **React Query provider** — Wraps the root layout to support client-side data fetching in Sprint 6's real-time hooks.

## Key Technical Decisions

- **Tailwind over CSS-in-JS** — Zero runtime overhead, perfect alignment with Next.js RSC model. Tailwind design tokens are defined once in `tailwind.config.ts` and available everywhere without importing a theme.
- **Radix UI primitives for accessibility** — Radix handles ARIA attributes, keyboard navigation, focus management, and screen-reader announcements for interactive components. We only add visual styles — no WAI-ARIA hand-rolling.
- **Server Components by default** — Contacts list, dashboard home, and layout wrappers are all RSC. Only components that need hooks/event handlers (`Sidebar` for `usePathname`, `Toast`, `SendMessageForm`) are `"use client"`.
- **No Storybook in Sprint 5** — Storybook setup has a non-trivial configuration cost with Tailwind + Next.js. Components are built and tested in context. Storybook is added in Sprint 11 if the team needs it.
- **Clerk `auth().protect()` in server components** — Replaces the old Next.js Middleware approach for per-page auth checks. Each server-component page calls `auth().protect()` to redirect unauthenticated users.

## Dependencies

- **External:** None beyond Sprint 2's Clerk credentials
- **Internal:** Sprint 2 complete — Clerk middleware, `(auth)` and `(dashboard)` route groups, `lib/api.ts` typed fetch wrapper. Sprint 4 complete — `GET /v1/contacts` works.

## Definition of Done

- [ ] `http://localhost:3000` shows dashboard home with nav sidebar and top bar after sign-in
- [ ] `http://localhost:3000/contacts` shows contacts table (empty or with seeded data) with lifecycle stage badges
- [ ] Navigating between routes highlights the correct sidebar link
- [ ] `Button` renders all 4 variants at sm/md/lg sizes without visual regressions
- [ ] `Toast` appears and auto-dismisses after 4 seconds
- [ ] Loading skeleton appears while contacts fetch is in-flight
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Radix Toast conflicts with Next.js RSC | Low | Medium | Toast is a `"use client"` component; wrap in a client boundary at layout level |
| Clerk `auth()` API changes between Next.js 14 and 15 | Low | Medium | Use `auth().protect()` pattern from Clerk Next.js docs — confirmed compatible with Next.js 15 App Router |
| Font loading causes CLS | Medium | Low | Use `next/font` with `Inter`; add `display: swap` |
| Design token naming collision with Tailwind defaults | Low | Low | Use `brand-*` prefix for all custom colors to avoid overriding Tailwind's `green-*` scale |
