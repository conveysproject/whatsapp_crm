# Sprint 5 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-2.md`
> Tasks 15–19 cover Sprint 5.

## Pre-conditions
- Sprint 2 complete and merged (Clerk auth, dashboard layout skeleton)
- Sprint 4 complete and merged (`GET /v1/contacts` works)
- Local API running: `pnpm --filter @trustcrm/api dev` (port 4000)
- Local web running: `pnpm --filter @trustcrm/web dev` (port 3000)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 15 | Tailwind design tokens + Radix install | `apps/web/tailwind.config.ts`, `apps/web/app/globals.css` |
| 16 | Button, Input, Badge, Toast components | `apps/web/components/ui/` |
| 17 | Sidebar + TopBar + dashboard layout | `apps/web/components/layout/Sidebar.tsx`, `TopBar.tsx`, `apps/web/app/(dashboard)/layout.tsx` |
| 18 | Dashboard home + contacts list page + loading skeleton | `apps/web/app/(dashboard)/page.tsx`, `contacts/page.tsx`, `contacts/loading.tsx` |
| 19 | Type-check + lint | All packages |

## Test Checklist

- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Sign in → dashboard shows sidebar with active "Dashboard" link
- [ ] Manual: Navigate to /contacts → contacts table renders (or shows empty state)
- [ ] Manual: Navigate between routes → sidebar highlights correct link
- [ ] Manual: contacts/loading.tsx skeleton visible for ≥500ms on slow network (throttle in DevTools)

## Deployment / Environment Notes

Add to `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Install Inter font (if not already via `next/font`):
```bash
# In apps/web/app/layout.tsx — use next/font/google
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], display: "swap" });
```

No new env vars required — all auth variables were set in Sprint 2.
