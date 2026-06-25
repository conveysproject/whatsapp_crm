# Segment Builder V2 — Design Spec

**Date:** 2026-06-25  
**Status:** Approved  
**Scope:** Redesign contact segment builder UI + add ContactEvent system for event-based filtering

---

## Overview

Replace the existing flat `SegmentBuilder` component with a tab-based segment builder matching Interakt's UX. Add a `ContactEvent` database model to enable event-based contact segmentation. Ship in two PRs: PR1 covers UI + Tags/Fields, PR2 covers the Events system end-to-end.

---

## 1. Data Model

### 1.1 New `FilterRule` type

Replaces the current flat discriminated union (keyed on `field`) with a three-way `type` discriminant matching the UI tabs.

```ts
export type MatchMode = "all" | "any";

// Tags tab
export type TagsRule = {
  type: "tags";
  operator: "is" | "isNot";
  value: string; // tag name
};

// Fields tab
export type FieldsRule = {
  type: "fields";
  field: string;
  operator: string;
  value?: string;
  valueTo?: string;       // date "between" only
  customFieldId?: string; // customField only
};

// Events tab
export type EventSubCondition = {
  property: string;
  operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "hasAnyValue";
  value?: string;
};

export type EventsRule = {
  type: "events";
  action: "hasDone";
  eventName: string;
  subConditions: EventSubCondition[];
  subMatch: "and" | "or";
};

export type FilterRule = TagsRule | FieldsRule | EventsRule;
```

**Backward compatibility:** Rules saved with the old format (has `field` but no `type`) are coerced at read time in `segment-evaluator.ts`:
- `field === "tags"` → `TagsRule`
- all others → `FieldsRule`

No destructive DB migration required for existing segment data.

### 1.2 Segment model addition

```prisma
model Segment {
  // existing fields ...
  whatsappOptedOnly Boolean @default(false) @map("whatsapp_opted_only")
}
```

This drives the "Only include customers whose 'WhatsApp opted' is true" toggle. When `true`, the evaluator appends `{ whatsappOptOut: false }` as an implicit AND clause.

### 1.3 New `ContactEvent` model

```prisma
model ContactEvent {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  contactId      String   @map("contact_id")
  contact        Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  name           String   // snake_case: "flow_completed", "campaign_sent", etc.
  properties     Json     @default("{}")
  occurredAt     DateTime @default(now()) @map("occurred_at")
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([organizationId, contactId])
  @@index([organizationId, name])
  @@index([contactId, name])
  @@map("contact_events")
}
```

Add `events ContactEvent[]` relation to `Contact` model.

**Event names shipped in PR2:**

| Event name | Properties | Source |
|---|---|---|
| `flow_started` | `flowId`, `flowName` | flow-execution worker |
| `flow_completed` | `flowId`, `flowName` | flow-execution worker |
| `campaign_sent` | `campaignId`, `campaignName` | campaign-dispatch worker |
| `campaign_delivered` | `campaignId` | WhatsApp webhook |
| `campaign_read` | `campaignId` | WhatsApp webhook |
| `message_sent` | — | WhatsApp webhook (contact sends) |
| `message_received` | — | WhatsApp webhook (contact receives) |

---

## 2. Backend

### 2.1 New API routes (PR2)

```
POST  /v1/contacts/:id/events
  body: { name: string; properties?: Record<string, string>; occurredAt?: string }
  auth: contacts_access

GET   /v1/contacts/events/names
  → string[]  (distinct event names for the org, for the event dropdown)

GET   /v1/contacts/events/:name/properties
  → string[]  (distinct property keys seen for this event name, for sub-condition dropdown)
```

### 2.2 Updated `segment-evaluator.ts` (PR1 + PR2)

**PR1** — handle `TagsRule` and `FieldsRule` (same Prisma clauses as today, dispatched via `rule.type`), plus old-format coercion, plus `whatsappOptedOnly` clause.

**PR2** — add `EventsRule` branch:

```ts
case "events": {
  const subClauses = rule.subConditions.map(buildSubConditionClause);
  const subMatchKey = rule.subMatch === "or" ? "OR" : "AND";
  return {
    contactEvents: {
      some: {
        organizationId,
        name: rule.eventName,
        ...(subClauses.length > 0 ? { [subMatchKey]: subClauses } : {}),
      },
    },
  };
}
```

### 2.3 New tags route (PR1)

```
GET /v1/contacts/tags
  → string[]  (distinct tag values across all contacts in the org, for the Tags dropdown)
```

Implemented with `prisma.$queryRaw` or Prisma `findMany` + `select: { tags: true }` + flatten + deduplicate.

### 2.4 `segments.ts` route update (PR1)

`PATCH /v1/segments/:id` — accept `whatsappOptedOnly?: boolean` in body and persist it.

### 2.4 Auto-logging events (PR2)

- `apps/api/src/workers/flow-execution.worker.ts` — log `flow_started` on flow begin, `flow_completed` on flow end
- `apps/api/src/workers/campaign-dispatch.worker.ts` — log `campaign_sent` per recipient
- WhatsApp webhook handler — log `campaign_delivered` / `campaign_read` on status callbacks

---

## 3. Frontend

### 3.1 Component tree

```
SegmentBuilderV2                          (new, replaces SegmentBuilder)
├── FilterRow[]                           (one per rule)
│   ├── TabSwitcher                       (Tags | Fields | Events pills)
│   ├── TagsRowContent                    ([operator ▼] [tag ▼])
│   ├── FieldsRowContent                  ([field ▼] [operator ▼] [value])
│   └── EventsRowContent                  ([Has Done] [event ▼])
│       └── SubConditionRow[]             ([With/AND/OR] [property ▼] [operator ▼] [value] [×])
├── RowConnector                          (AND | OR pill between each row — global match mode; changing any connector changes all)
├── AddConditionButton                    (+ Add Condition)
└── WhatsAppOptedToggle                   (bottom toggle + Recommended badge)
```

### 3.2 Custom `Dropdown` component

Replace all `<select>` elements with a styled popover dropdown:
- White card, border, shadow
- Checkmark on selected item
- Optional search input (used for Events name dropdown)
- Built on Radix UI `Popover` (already in project)

### 3.3 Fields configuration

| Field key | Display name | Value input |
|---|---|---|
| `firstName`, `lastName` | First Name, Last Name | text |
| `email` | Email | text |
| `phoneNumber` | Phone Number | text |
| `leadStatusId` | Status | dropdown (lead statuses from API) |
| `whatsappOptOut` | WhatsApp Opt-out | none (operator is sufficient) |
| `disableBot` | Bot Disabled | none |
| `countryCode` | Country | text |
| `languageCode` | Language | text |
| `assignedUserId` | Assigned User | text |
| `groups` | Groups | text |
| `createdAt` | Creation Date | date / number (days ago) |
| `lastMessageAt` | Last Message Date | date / number (days ago) |
| `customField` | Custom Fields | dynamic from API + text |

### 3.4 Operators per field type

| Field type | Operators |
|---|---|
| Text | `Is`, `Is not`, `Contains`, `Does not contain`, `Is empty`, `Has any value` |
| Date | `Less than X days ago`, `More than X days ago`, `After`, `On`, `Before`, `Is empty`, `Has any value` |
| Boolean | `Is true`, `Is false`, `Is empty`, `Has any value` |
| Status / enum | `Is` |
| User / group | `Is`, `Is not`, `Is empty` |

### 3.5 Tags tab

- Operator: `Is` / `Is Not`
- Value: dropdown of org's existing tags (fetched from `GET /v1/contacts/tags`)

### 3.6 Events tab (PR2)

- Action: `Has Done` (static label — "Has Not Done" deferred)
- Event name: searchable dropdown populated from `GET /v1/contacts/events/names`
- Sub-condition property: dropdown from `GET /v1/contacts/events/:name/properties`
- Sub-condition operator: `Is`, `Is not`, `Contains`, `Does not contain`, `Is empty`, `Has any value`
- Sub-conditions joined by AND/OR (per-event `subMatch`)
- `+ Add Condition within Event` adds a new sub-condition row

### 3.7 Page-level changes

**`SegmentDetailPage`** (`/contacts/segments/[id]/page.tsx`):
- Swap `SegmentBuilder` → `SegmentBuilderV2`
- Add `whatsappOptedOnly` toggle below the rules, wired to segment PATCH

**`SegmentsPage`** (`/contacts/segments/page.tsx`):
- "New Segment" button opens a **Save Segment modal** (dialog) instead of inline name input
- Modal contains: segment name input + `SegmentBuilderV2` + WhatsApp toggle + Save button
- Uses existing Dialog/Modal component pattern in the project

---

## 4. PR Plan

### PR 1 — UI + Tags + Fields
- Prisma migration: add `whatsappOptedOnly` to `Segment`
- Update `FilterRule` type + backward-compat coercion in `segment-evaluator.ts`
- Update `PATCH /v1/segments/:id` to accept `whatsappOptedOnly`
- New `SegmentBuilderV2` component (Tags + Fields tabs fully working, Events tab placeholder)
- New `Dropdown` component
- Update `SegmentDetailPage` and `SegmentsPage`

### PR 2 — Events System
- Prisma migration: add `ContactEvent` model
- New event routes (`POST /contacts/:id/events`, `GET /contacts/events/names`, `GET /contacts/events/:name/properties`)
- Update `segment-evaluator.ts` with events branch
- Auto-log events from workers + webhook
- Enable Events tab in `SegmentBuilderV2`

---

## 5. Out of Scope

- "Has Not Done" action on Events (deferred)
- Per-pair AND/OR connectors between top-level rows (global match mode only)
- Event deduplication / frequency filters (e.g. "done more than 3 times")
- Segment sync / materialized contact lists (existing `SegmentContact` table unchanged)
