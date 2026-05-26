# Segment Filter Redesign

**Date:** 2026-05-27  
**Status:** Approved  
**Scope:** Expand segment filters to cover all contact fields + rework the filter builder UI

---

## Problem

The segment evaluator only supports 3 filter fields (`lifecycleStage`, `tags`, `createdAt`), but contacts have 20+ properties that users see on the add-contact page. The SegmentBuilder UI is a flat list with no AND/OR control, making it impossible to express most real-world audience definitions.

---

## Goals

1. Support all contact fields as filterable segment criteria
2. Add a global AND/OR match toggle per segment
3. Rework the filter builder UI with grouped fields, smart operators, and type-aware value inputs
4. Fix the missing `/contacts` endpoint the segment detail page calls (replace with `/evaluate` response)
5. Show live matching contact count on the segment detail page after save

---

## Non-Goals

- Grouped/nested AND+OR logic (e.g. HubSpot-style condition groups) — deferred
- Segment performance metrics / usage history
- OR logic within a single field (e.g. tag = VIP OR tag = Premium as one rule)

---

## Data Model Changes

### `Segment` table — new column

```sql
ALTER TABLE segments ADD COLUMN match VARCHAR(3) NOT NULL DEFAULT 'all';
```

`match` is `"all"` (AND) or `"any"` (OR). Default `"all"` preserves existing segment behaviour.

Prisma schema addition to `model Segment`:
```prisma
match String @default("all")
```

### `FilterRule` shape (stored in `filters` JSON)

Each element of the `filters` JSON array follows this discriminated union:

```ts
type FilterRule =
  | { field: "firstName" | "lastName" | "email" | "phoneNumber"; operator: "contains" | "equals" | "startsWith" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: "lead" | "prospect" | "customer" | "loyal" | "churned" }
  | { field: "tags"; operator: "contains" | "doesNotContain"; value: string }
  | { field: "countryCode"; operator: "equals" | "isNot"; value: string }
  | { field: "languageCode"; operator: "equals" | "isNot"; value: string }
  | { field: "companyName"; operator: "contains" | "equals" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "assignedUserId"; operator: "equals" | "isNot" | "isEmpty"; value?: string }
  | { field: "groups"; operator: "memberOf" | "notMemberOf"; value: string }
  | { field: "whatsappOptOut" | "disableBot"; operator: "isTrue" | "isFalse" }
  | { field: "createdAt" | "lastMessageAt"; operator: "after" | "before" | "between"; value: string; valueTo?: string }
  | { field: "customField"; operator: "contains" | "equals" | "isEmpty" | "greaterThan" | "lessThan" | "isTrue" | "isFalse" | "after" | "before"; customFieldId: string; value?: string }
```

---

## Backend Changes

### `apps/api/prisma/schema.prisma`

Add `match String @default("all")` to `model Segment`.

### `apps/api/src/lib/segment-evaluator.ts`

Full rewrite. Key structure:

```ts
export async function evaluateSegment(segmentId: string, organizationId: string) {
  const segment = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
  const rules = segment.filters as FilterRule[];
  const matchKey = segment.match === "any" ? "OR" : "AND";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      deletedAt: null,
      [matchKey]: rules.map(buildClause),
    },
    select: { id: true, firstName: true, lastName: true, phoneNumber: true, lifecycleStage: true },
  });

  return { count: contacts.length, contacts };
}
```

`buildClause(rule: FilterRule)` maps each field to its Prisma clause:

| Field | Prisma path | Notes |
|---|---|---|
| firstName, lastName, email, phoneNumber | Direct field on Contact | `contains`→`{ contains: v }`, `isEmpty`→`{ equals: null }` |
| lifecycleStage | Direct enum field | `equals`/`not` |
| tags | `{ has: v }` / `{ not: { has: v } }` | Array field |
| countryCode, languageCode | Direct string fields | `equals`/`not` |
| companyName | Via `company: { name: { contains: v } }` | Relation |
| assignedUserId | Direct FK | `equals`/`not`/null check |
| groups | `groupContacts: { some: { groupId: v } }` | Relation |
| whatsappOptOut, disableBot | Direct boolean | `true`/`false` |
| createdAt | Direct datetime | `lt`/`gt`/range |
| lastMessageAt | `conversations: { some: { createdAt: { gt: v } } }` | Approximation via latest conversation |
| customField | `customFieldValues: { some: { customFieldId: x, value: y } }` | Subquery |

### `apps/api/src/routes/segments.ts`

- `POST /v1/segments` and `PATCH /v1/segments/:id` — accept and persist `match` field
- `GET /v1/segments/:id` — return `match` in response
- `POST /v1/segments/:id/evaluate` — return `{ count, contacts: [{ id, name, phoneNumber, lifecycleStage }] }` (already exists, expand response shape)

---

## Frontend Changes

### `apps/web/components/segments/SegmentBuilder.tsx`

**Props:**
```ts
interface SegmentBuilderProps {
  filters: FilterRule[];
  match: "all" | "any";
  onChange: (filters: FilterRule[]) => void;
  onMatchChange: (match: "all" | "any") => void;
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Contacts match  [ALL ▾]  of the following rules    │
├─────────────────────────────────────────────────────┤
│  [Field ▾ grouped]  [Operator ▾]  [Value input]  ×  │
│  [Field ▾ grouped]  [Operator ▾]  [Value input]  ×  │
│  + Add filter                                        │
└─────────────────────────────────────────────────────┘
```

**Field dropdown groups** (rendered as `<optgroup>`):
- Identity → First name, Last name, Email, Phone number
- Status → Lifecycle stage, WhatsApp opt-out, Bot disabled
- Geography → Country, Language
- Organization → Company, Assigned user, Groups
- Engagement → Created date, Last message date
- Tags → Tags
- Custom Fields → (dynamically loaded from `/v1/contacts/custom-fields`)

**Operator dropdown** re-renders when field changes. Only valid operators for the selected field type are shown.

**Value input** swaps component based on field+operator:
- Text fields → `<input type="text">`
- Enum fields → `<select>` with hardcoded options (lifecycle stages, countries, languages, org users, groups)
- Boolean operators (`isTrue`/`isFalse`) → no value input rendered
- `isEmpty`/`isNotEmpty` operators → no value input rendered
- Date fields → `<input type="date">` (two inputs for `between`)
- Custom fields → type-aware (text input, number input, date picker, boolean select, option select)

**Custom field loading:** On mount, fetch `GET /v1/contacts/custom-fields`. Append results to the Custom Fields `<optgroup>`. Each field carries `{ id, name, type }` so operators and value input are correct.

### `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`

- Read `match` from segment response, pass to `SegmentBuilder` as prop
- On save: PATCH with `{ filters, match }`
- After save: call `POST /v1/segments/:id/evaluate`, display result:
  - `"47 contacts match this segment"` (green badge)
  - Contacts preview table: name, phone, lifecycle stage (replace the broken `/contacts` call)

### `apps/web/app/(dashboard)/contacts/segments/page.tsx`

- Show match mode next to filter count in the list: `"3 filters · ANY"`

---

## Migration Strategy

1. Add `match` column with `DEFAULT 'all'` — existing segments silently behave identically (all-AND)
2. Use `prisma db push` + manual migration file + `prisma migrate resolve --applied` (standard pattern for this machine)

---

## Testing

- Unit tests for `buildClause()` covering each field type and operator
- Integration test for `evaluateSegment()` with `match: "all"` and `match: "any"`
- Existing segment route tests updated to include `match` field in create/update/get assertions
- Frontend: manual verification that all field types render correct operator and value component

---

## Files Touched

```
apps/api/prisma/schema.prisma
apps/api/src/lib/segment-evaluator.ts
apps/api/src/routes/segments.ts
apps/api/src/routes/segments.test.ts
apps/web/components/segments/SegmentBuilder.tsx
apps/web/app/(dashboard)/contacts/segments/page.tsx
apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx
```
