# Campaigns Feature — Full Overhaul Design

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** Bug fixes + polish + missing features to match "Done" quality bar

---

## 1. Context

All major features (Inbox, Contacts, Groups, Segments, Import, Export, Custom Fields, Templates) have been upgraded to a robust, polished standard. Campaigns is the last one remaining.

Reference competitor: WhatsJet v7.2.0 (PRD at `C:\Users\Conveys\Downloads\...\WhatsJet_Campaign_PRD.md`).

---

## 2. Gap Summary

### Functional Bugs
- **Groups silently dropped:** new-campaign form sends `groupIds` to `/campaigns/:id/schedule`, but the schedule handler ignores them. `CampaignGroup` junction table exists in schema but is never populated.
- **Broken executed tab:** `campaigns/[id]/logs/page.tsx` calls `GET /campaigns/:id/recipients` which does not exist in the API.

### Missing API Endpoints
- `GET /campaigns/:id/recipients` — executed (sent/delivered/read/failed) recipients, paginated
- `DELETE /campaigns/:id` — delete only when `deleteAllowed` (draft or future-scheduled)
- `GET /campaigns/:id/queue-log-export` — CSV download for pending queue
- `GET /campaigns/:id/expired-log-export` — CSV download for expired log
- Report endpoint missing `expired` count (only returns sent/delivered/read/failed/pending)

### Missing UI Features
- `displayStatus` not used on list — shows "scheduled" instead of "upcoming" for future-scheduled
- No delete action on list for draft/upcoming campaigns
- No status filter beyond active/archived tabs
- No message interval (throttle) field in new-campaign form
- No template preview in new-campaign form
- No estimated recipient count for group/segment selection
- No error toasts in new-campaign form (silent fail)
- No breadcrumb on detail or logs pages
- No link from detail page to logs page
- No `expired` stat in the detail stats grid
- No delivery/read rate percentages on detail page
- No edit button on detail page for draft campaigns
- Logs page: no pagination UI, no loading skeletons, raw/unpolished styling, no per-tab export buttons

---

## 3. Architecture

No schema changes required — `CampaignGroup`, `CampaignSegment`, `CampaignRecipient`, and `Campaign` are all correctly modeled. The changes are in routes and UI only.

### Campaign targeting model
A campaign can target:
1. **All contacts** — no segment, no groups
2. **Groups** — `groupIds[]` → saved to `CampaignGroup` junction on create, worker reads `campaignGroups` 
3. **Segment** — `segmentId` → saved to `CampaignSegment` junction on schedule, evaluated by segment-evaluator

These are mutually exclusive in the UI (radio picker). Groups and segments can coexist in DB (union targeting) but the UI picks one mode.

---

## 4. API Changes (`apps/api/src/routes/campaigns.ts`)

### 4.1 `POST /campaigns` (modify)
Add `groupIds?: string[]` to `CampaignBody`. After creating the campaign, insert rows into `CampaignGroup` for each provided groupId.

```
data: { organizationId, name, templateId, campaignType, scheduledAt, messageInterval }
then: campaignGroup.createMany({ data: groupIds.map(gid => ({ campaignId, contactGroupId: gid })) })
```

### 4.2 `GET /campaigns/:id/report` (modify)
Add `expired` count alongside the existing 5 stats:
```
expired: fastify.prisma.campaignRecipient.count({ where: { campaignId, status: "expired" } })
```

### 4.3 `GET /campaigns/:id/recipients` (new)
Paginated list of executed recipients (status in: sent, delivered, read, failed).
- Query: `page` (default 1), 50 per page
- Returns: `{ data: Recipient[], total: number }`
- Include contact: firstName, lastName, phoneNumber

### 4.4 `DELETE /campaigns/:id` (new)
Only allowed when `isDeleteAllowed(status, scheduledAt)` returns true (draft, or scheduled with future date).
Returns 409 with `{ error: { code: "DELETE_NOT_ALLOWED" } }` otherwise.

### 4.5 `GET /campaigns/:id/queue-log-export` (new)
CSV download for pending recipients. Same format as existing `/export` but filtered to `status: "pending"`.
Filename: `campaign-queue-{name}.csv`

### 4.6 `GET /campaigns/:id/expired-log-export` (new)
CSV download for expired recipients. Filtered to `status: "expired"`.
Filename: `campaign-expired-{name}.csv`

---

## 5. Campaign Worker Change (`apps/api/src/workers/campaign.ts`)

When processing a campaign job, if the campaign has `campaignGroups` and no segment, target contacts from those groups:

```
const groups = await prisma.campaignGroup.findMany({ where: { campaignId }, include: { contactGroup: { include: { contacts: { include: { contact: true } } } } } })
const contacts = dedupe(groups.flatMap(g => g.contactGroup.contacts.map(gc => gc.contact)))
```

If segment is also present, union the contacts.

---

## 6. UI Changes

### 6.1 `campaigns/page.tsx` — List Page

**Status tabs:** Replace the active/archived toggle with a full-width tab strip:
`All | Draft | Upcoming | Running | Paused | Completed | Aborted | Archived`

Filtering logic:
- "All" = not archived
- "Archived" = isArchived: true  
- Others = displayStatus match

**displayStatus badge:** Use `computeDisplayStatus(status, scheduledAt)` value from API response (already returned by GET /campaigns). Map to badge variant:
- upcoming → yellow
- running → blue
- paused → yellow
- completed → green
- aborted/cancelled → red
- draft → gray

**Row actions:**
- View → `/campaigns/:id`
- Delete button (trash icon) — shown when `campaign.deleteAllowed === true`, confirm dialog before DELETE
- Archive/Unarchive — existing behavior
- Abort — existing behavior (running only)
- Requeue — existing behavior

**Recipient count:** Show `_count.recipients` if available (add to list query).

### 6.2 `campaigns/new/page.tsx` — 4-Step Wizard

Replace the current flat form with a step-by-step wizard. Use a step indicator at the top.

**Step 1 — Details**
- Campaign name (required)
- Campaign type radio: "Template message" | "Free text"

**Step 2 — Message**
- If type = template: searchable template dropdown + preview panel (right side shows `bodyText` from template record)
- If type = free-text: textarea for message body

**Step 3 — Audience**
- Radio: "All contacts" | "Contact groups" | "Segment"
- All contacts: shows total contact count
- Groups: checkbox grid (existing groups UI, polished)
- Segment: dropdown
- Live recipient count shown at bottom of this step
- Message interval field: numeric input "Delay between messages (seconds)" default 0

**Step 4 — Schedule & Launch**
- Toggle: "Send immediately" vs "Send later"
- If "Send later": datetime-local picker
- Summary card: name, type, audience selection, estimated count, schedule time
- Launch button (disabled while submitting)
- Error toast shown on any API failure

**Navigation:** Back/Next buttons. Step is validated before advancing (name required on Step 1, template/body required on Step 2, etc.).

**API calls:**
1. POST /campaigns → create with name, templateId/freeTextBody, campaignType, groupIds (if groups mode)
2. POST /campaigns/:id/schedule → segmentId (if segment mode, else omit), scheduledAt (if scheduled)

Note: The schedule endpoint body type must change `segmentId: SegmentId` (required) → `segmentId?: SegmentId` (optional). When omitted, the worker targets either group contacts (if campaignGroups exist) or all org contacts.

### 6.3 `campaigns/[id]/page.tsx` — Detail Page

**Breadcrumb:** `← Campaigns` link at top.

**Header row additions:**
- "View Logs" button → `/campaigns/:id/logs`
- "Edit" button (pencil icon) → `/campaigns/:id/edit` — only shown when `status === "draft"`

**Stats grid:** Expand from 5 to 6 cards: Sent | Delivered | Read | Failed | Pending | Expired

**Rate display:** Below the stat cards, show calculated rates:
```
Delivery rate: {Math.round(delivered / Math.max(sent, 1) * 100)}%
Read rate: {Math.round(read / Math.max(delivered, 1) * 100)}%
```

**Template info:** For template-type campaigns, fetch `GET /v1/templates/:templateId`. If the template exists, show "Template: {template.name}". If 404 (campaignType is non-template and templateId stores the body text), show nothing. This avoids the unreliable UUID-detection heuristic.

### 6.4 `campaigns/[id]/logs/page.tsx` — Logs Page

**Breadcrumb:** `← Campaign` link to `/campaigns/:id`.

**Loading:** Per-tab loading skeleton (3 shimmer rows).

**Tabs:** Queue | Executed | Expired — use the same tab strip style as the campaign list page.

**Executed tab:** Calls `GET /campaigns/:id/recipients` (new endpoint).

**Pagination:** Show page controls (prev/next + current page) below the list. Each tab independently tracked.

**Per-tab export buttons:**
- Queue tab → "Download Queue CSV" → `GET /campaigns/:id/queue-log-export`
- Executed tab → "Download Executed CSV" → `GET /campaigns/:id/export` (existing)
- Expired tab → "Download Expired CSV" → `GET /campaigns/:id/expired-log-export`

**Styling:** Match Done standard — white card, divide-y, status badges using the Badge component, avatar initials for contact names, empty state with icon.

### 6.5 `campaigns/[id]/edit/page.tsx` — Edit Draft (new page)

Simple form for editing a draft campaign:
- Name field
- Template / free-text body (depending on campaignType)
- Submit → PATCH /campaigns/:id
- Redirect to /campaigns/:id on success
- Show 400 error if campaign is no longer draft

---

## 7. Component Architecture

No new shared components needed. All changes are page-level.

Reuse:
- `Badge` — status badges
- `Button` — actions
- `Input` — form fields  
- `Toast` / `useToast` — notifications
- `WhatsAppGate` — wraps all campaign pages (already on list and new pages)

---

## 8. Error Handling

- API errors shown as toast (variant="error") — applies to new-campaign wizard and edit page
- 409/402 errors on create show specific messages ("Campaign limit reached", etc.)
- DELETE confirm dialog: "Delete '{name}'? This cannot be undone."
- All `fetch` calls wrapped in try/catch with toast on catch

---

## 9. Testing

Each new API endpoint gets a test case in `campaigns.test.ts`:
- `GET /campaigns/:id/recipients` — returns paginated executed recipients
- `DELETE /campaigns/:id` — 204 for draft, 409 for running
- `GET /campaigns/:id/report` — includes `expired` count

Existing tests must continue to pass.

---

## 10. Out of Scope

- Campaign analytics dashboard / charts (separate sprint)
- Bulk campaign operations
- Campaign cloning / duplication
- NT campaign preset management UI (existing API, no UI requested)
- Email/SMS campaign types
