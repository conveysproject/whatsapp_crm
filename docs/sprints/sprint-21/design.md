# Sprint 21 — Advanced Search

## Sprint Goal
Make finding any contact, conversation, or message instantaneous — replacing slow list-scroll UX with a keyboard-driven global search palette that surfaces results across all entity types in under 200 ms.

## What We're Building

- **Unified search API** — `apps/api/src/routes/search.ts`: `GET /v1/search?q=&type=contacts|conversations|all`. Calls `searchContacts` and `searchConversations` in parallel from `apps/api/src/lib/search.ts`. Returns `{ contacts: [], conversations: [], query }`. Both searches are scoped to `organizationId`.
- **Conversation search index** — `apps/api/src/lib/search.ts`: adds `searchConversations(orgId, query, limit)` alongside existing `searchContacts`. Meilisearch `conversations` index is populated in the inbound message worker (contact name + last message body + conversation ID). Also indexes outbound messages when sent.
- **GlobalSearch component** — `apps/web/components/layout/GlobalSearch.tsx`: command-palette overlay triggered by ⌘K / Ctrl+K. Search input with 250 ms debounce. Results grouped into "Contacts" and "Conversations" sections. Clicking a result navigates and closes the palette.
- **Advanced contact filters** — `apps/web/app/(dashboard)/contacts/page.tsx`: collapsible filter panel with lifecycle stage multi-select, tag filter (AND/OR mode), last message date range picker, and custom field search. Filters serialized to URL params; React Query key includes filters for proper cache separation.

## Key Technical Decisions

- **Meilisearch for all full-text search, Postgres for filters** — Meilisearch handles fuzzy full-text (contact name, phone, message body). Structured filters (date ranges, stage, tags) are applied at the Postgres layer via the existing JSONB segment evaluator pattern. The two are not combined — search and filter are separate UI interactions.
- **`conversations` Meilisearch index updated in the worker, not the webhook** — Same pattern as contacts: indexing happens asynchronously after persistence. The webhook returns 200 immediately; Meilisearch index is eventually consistent (typically <1 s behind).
- **250 ms debounce on GlobalSearch input** — Prevents a Meilisearch query on every keystroke. 250 ms feels responsive while cutting request count by ~5× compared to no debounce.
- **⌘K shortcut registered globally** — `useEffect` on the window object in the GlobalSearch component. The shortcut fires anywhere in the dashboard — no focus requirement.
- **Filter state in URL params** — Allows deep-linking to a filtered contact view and browser back-button navigation between filter states. `useSearchParams` + `useRouter` from Next.js App Router.

## Dependencies

- **External:** Meilisearch running (already in docker-compose from Sprint 4)
- **Internal:** Sprints 1–20 complete; `searchContacts` already implemented in Sprint 4; `conversations` table and inbound worker exist

## Definition of Done

- [ ] `GET /v1/search?q=alice` returns contacts and conversations matching "alice"
- [ ] ⌘K opens search palette; typing shows results within 300 ms
- [ ] Clicking contact result → navigates to `/contacts/:id`; clicking conversation result → navigates to `/inbox/:id`
- [ ] Contacts page filter panel: lifecycle stage + tag filter narrows list correctly
- [ ] Conversations are indexed in Meilisearch after each inbound message
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `search.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `conversations` Meilisearch index not created on first run | Medium | Medium | `lib/search.ts` calls `index.ensureIndex()` at startup if it doesn't exist |
| GlobalSearch overlay z-index conflict with modals | Low | Low | `z-50` on the overlay; all modals use `z-40` — no conflict |
| Filter URL params too long (many tags selected) | Low | Low | Tags encoded as comma-separated string; URL stays under 2 KB for realistic filter sets |
