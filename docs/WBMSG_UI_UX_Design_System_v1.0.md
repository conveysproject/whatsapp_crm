# WBMSG
# UI/UX Design System &amp; Style Guide
Visual &amp; Interaction Standards — ISO 9241-210 Human-Centred Design
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Design Lead
## 1. Purpose &amp; Scope
This guide defines the visual language, interaction patterns, and accessibility standards for every WBMSG surface — web app, marketing site, transactional emails, in-product notifications, and customer-facing documentation. Designers and engineers consult this guide before shipping; deviations require Design-Lead sign-off and live in a Design Decision Record.
## 2. Brand Foundation
### 2.1 Brand Voice
- Trustworthy: precise, accountable, never overpromising.
- Pragmatic: shows the right next step, never preaches.
- Inclusive: India-first English (en-IN), regional-language ready.
- Calm: avoids exclamation marks, marketing hyperbole, and panic patterns.
### 2.2 Tone Examples

| Don't | Do |
| --- | --- |
| 'Awesome! Your campaign is rocking!' | 'Campaign sent. 2,310 recipients.' |
| 'Oops! Something went wrong.' | 'We could not load this. Try again or contact support.' |
| 'You're 1 step away from greatness!' | '1 step left to launch your inbox.' |
| 'Save big with our Pro plan!' | 'Pro plan unlocks 25 agents and 90-day audit log.' |

## 3. Colour System
### 3.1 Primary Palette

| Token | Hex | Use |
| --- | --- | --- |
| brand.navy.900 | #0E2243 | Headers, primary text, dark backgrounds |
| brand.navy.700 | #1F3A68 | Default brand colour; CTAs, primary nav |
| brand.navy.500 | #3D5C8A | Secondary brand |
| brand.navy.300 | #9AB0CD | Disabled brand element |
| brand.navy.100 | #E5ECF5 | Subtle backgrounds |
| brand.maroon.700 | #B00020 | Error, destructive action |
| brand.maroon.500 | #D33E5C | Hover state for destructive |

### 3.2 Neutral Palette

| Token | Hex | Use |
| --- | --- | --- |
| neutral.0 | #FFFFFF | Surface — light |
| neutral.50 | #F7F8FA | Surface — subtle / page bg |
| neutral.100 | #EDEFF3 | Borders / dividers (subtle) |
| neutral.300 | #C7CCD3 | Borders (default) |
| neutral.500 | #7B8190 | Secondary text |
| neutral.700 | #3D4452 | Primary text |
| neutral.900 | #0F1116 | Highest contrast text |

### 3.3 Semantic

| Token | Hex | Use |
| --- | --- | --- |
| success.500 | #1A8754 | Success state |
| warning.500 | #C77700 | Warning state |
| error.500 | #B00020 | Error state — same as brand maroon |
| info.500 | #1F6FB8 | Informational |

### 3.4 Contrast Rules
- Body text on neutral.0 background: contrast ≥ 7:1 (AAA).
- Body text on neutral.50: contrast ≥ 4.5:1 (AA).
- Brand-on-brand combinations validated by axe-core in CI.
- Dark mode: independently verified contrast tokens; no inversion shortcut.
## 4. Typography
### 4.1 Font Stack
- Primary (UI): 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif.
- Marketing display: 'Sora Variable' for hero headings only.
- Monospace: 'JetBrains Mono', ui-monospace.
- Hindi / Marathi: 'Noto Sans Devanagari Variable' as fallback in Indian locales.
### 4.2 Type Scale

| Token | Size / LH | Weight | Use |
| --- | --- | --- | --- |
| display.lg | 48 / 56 | 700 | Marketing hero only |
| display.md | 36 / 44 | 700 | Marketing section heading |
| heading.h1 | 30 / 38 | 600 | Page heading |
| heading.h2 | 24 / 32 | 600 | Section heading |
| heading.h3 | 20 / 28 | 600 | Subsection |
| heading.h4 | 16 / 24 | 600 | Small heading |
| body.lg | 16 / 24 | 400 | Default body |
| body.md | 14 / 20 | 400 | Compact body, table cells |
| body.sm | 12 / 16 | 400 | Caption, metadata |
| mono.md | 13 / 20 | 500 | Code, IDs |

### 4.3 Rules
- Maximum line length: 75 characters for body text.
- Headings always use display/heading tokens — never raw px.
- Numerals tabular for tables and metrics; proportional for prose.
- Truncation: visible ellipsis + tooltip with full text.
## 5. Spacing &amp; Layout
- 8 px base grid; allowed values 0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Page max-width: 1280 px (app); 1200 px (marketing).
- Sidebar: 240 px collapsed → 60 px icon-only.
- Form fields: 40 px height default; touch targets ≥ 44×44 px on mobile.
- Card radius: 12 px default; 8 px for inline tags; 9999 px for chips/avatars.
## 6. Components
### 6.1 Library
- Headless behaviour: Radix UI (Dialog, Popover, Menu, Tabs, etc.).
- Styling: Tailwind CSS 4 with custom design tokens; cva for variant management.
- Icons: Lucide-react; never inline SVG without a token.
- Storybook: every component has stories covering default, variants, states, a11y.
### 6.2 Component Variants (illustrative)

| Component | Variants | Sizes | States |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, destructive | sm, md, lg, icon | default, hover, active, disabled, loading |
| Input | text, email, password, search, number | sm, md, lg | default, focused, invalid, disabled |
| Card | elevated, outlined, filled | sm, md, lg | default, hover (interactive) |
| Toast | info, success, warning, error | — | appearing, visible, dismissing |
| Modal | default, fullscreen, drawer | sm, md, lg, full | — |
| Tag | neutral, semantic, brand | sm, md | default, removable |

### 6.3 Component Documentation Template
- Anatomy diagram (parts named).
- Usage do's and don'ts (with screenshots).
- Props table with types and defaults.
- Accessibility notes (keyboard, screen-reader behaviour).
- Storybook link.
## 7. Iconography &amp; Imagery
- Icon stroke 1.5 px, 24×24 px viewBox.
- Single-tone icons; never colourful illustrations as functional UI.
- Marketing illustrations: custom set, geometric, navy + maroon accents only.
- Avatar: square 8 px radius; never circular for businesses (only people).
- Photography: real Indian SMB scenes; no obvious stock; royalty-cleared and DPDP-compliant model release.
## 8. Motion &amp; Micro-Interaction
- Default duration 150 ms; complex transitions 250 ms; never &gt; 400 ms.
- Easing: ease-out for entrances, ease-in for exits, ease-in-out for state changes.
- Respect prefers-reduced-motion; replace transforms with opacity-only fades.
- Loading: skeletons preferred over spinners for content &gt; 200 ms.
- Optimistic UI for user actions where reversal cost is low.
## 9. Accessibility (WCAG 2.1 AA)
- Every interactive element keyboard-reachable, with visible focus ring.
- ARIA roles only when native semantics insufficient; prefer the right HTML element.
- Form fields: explicit label association; error message tied via aria-describedby.
- Live regions for toasts and async status updates.
- Colour never the sole signal — pair with icon, text, or shape.
- axe-core in CI; tests fail on critical or serious violations.
- Manual a11y review for new templates; quarterly external audit.
- Lighthouse a11y score ≥ 90 on all critical paths.
## 10. Internationalisation
- All copy externalised; no hardcoded English in components.
- Default locale en-IN; RTL not currently supported (no roadmap need).
- Currency, date, number formatted via Intl APIs with locale-aware tokens.
- Pseudo-locale (xx-PSEUDO) used in CI to surface untranslated strings and overflow.
- Translation handled by professional service (Lingoport / Lokalise) for hi-IN, mr-IN by Month 3 post-GA.
## 11. Content Patterns
### 11.1 Empty States
- One-line headline naming what is missing.
- One-line explanation of why and what to do next.
- One primary CTA; never two.
- Visual: simple line illustration; no character mascots.
### 11.2 Error Messages
- Lead with what happened, then how to fix.
- Include the error code in monospace at the end for support reference.
- Avoid blame: 'We could not save…' not 'You did not provide…'.
- Provide retry or undo where reasonable.
### 11.3 Loading &amp; Skeletons
- Skeleton matches final layout; no centred spinners on full pages.
- Inline spinners for buttons during action; preserve original button width.
- If load &gt; 5 s, show progress or estimated time; do not silently spin.
## 12. Forms
- Single column for forms with &gt; 3 fields.
- Field grouping with clear section headings; never an accordion to hide required fields.
- Inline validation only after blur; on submit, scroll to first error.
- Required indicators on the field; never via tooltip.
- Help text below the field, never overlapping.
- Save indicator with timestamp on auto-saving forms.
## 13. Tables
- Responsive: column priority defined; lower-priority columns drop on narrow viewports.
- Sticky header on scroll for long tables.
- Inline actions appear on row hover; visible at all times on touch.
- Bulk actions surface in a sticky bar on selection.
- Empty cells show '—' (em-dash), not blank, to confirm intent.
## 14. Data Visualisation
- Library: Visx or Recharts; never Chart.js (mobile/perf reasons).
- Sequential palettes for ordinal data; categorical palette caps at 8 colours.
- Always include axis labels and units.
- Tooltip on hover; click-to-pin for keyboard accessibility.
- Sparklines reserved for in-table trend; never standalone.
## 15. Notifications &amp; Toasts
- Toast for transient success / info; max 3 stacked.
- Banner for persistent system-level (maintenance, billing past-due).
- In-product Inbox for asynchronous events (campaign complete, export ready).
- Email + SMS for high-importance: P1 incident, billing, security event.
## 16. Mobile &amp; Responsive
- Mobile-first breakpoints: 360, 600, 900, 1280, 1440.
- Hamburger menu on &lt; 900 px; full sidebar on ≥ 900.
- Touch targets ≥ 44 × 44 px; spacing ≥ 8 px between targets.
- PWA install prompt after 3 sessions; service worker offline-first for inbox skeleton.
## 17. Dark Mode
- First-class — not a tinted invert.
- Surface tokens: surface.bg / surface.fg / surface.muted independently themed.
- Brand colours adjusted for legibility, not desaturated.
- Toggle exposed in user menu; respects prefers-color-scheme by default.
## 18. Design Tokens — Source of Truth
- Tokens defined in /packages/design-tokens (Style Dictionary format).
- Build outputs: Tailwind preset, CSS variables, Figma plugin sync.
- Single source ensures parity between Figma artboards and code.
- Token changes require: PR, design review, designer + engineer approval, visual-regression diff.
## 19. Visual Regression &amp; QA
- Chromatic captures Storybook snapshots on every PR.
- Visual diff on critical pages run nightly via Percy.
- Manual a11y testing: keyboard-only walkthrough on every new feature.
- Manual in-app review with Design Lead for surfaces with new patterns.
## 20. Governance
- Design Lead owns this guide; quarterly review with Tech Leads.
- Component additions: design proposal in Figma, implementation in monorepo, Storybook, doc page — all in one PR.
- Deprecation: old component marked deprecated for 1 release cycle then removed.
- Design Decision Records (DDRs) for significant choices (e.g., dropping a component, swapping a library).
## 21. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | Design Lead | Baseline at end of Sprint 0; tokens + 6 component variants live in Storybook |

End of UI/UX Design System &amp; Style Guide | WBMSG v1.0 | April 2026 | ISO 9241-210