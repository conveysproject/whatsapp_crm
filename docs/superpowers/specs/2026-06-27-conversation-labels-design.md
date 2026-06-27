# Conversation Labels — Design Spec

**Date:** 2026-06-27
**Status:** Approved
**Scope:** Inbox-level conversation labels for agent queue management, matching Interakt parity.

---

## Overview

Agents need a fast way to categorise conversations in the inbox so they can filter their queue and focus on one type of query at a time (e.g. "Billing Issue", "High Priority", "Refund"). This is distinct from:

- **Contact Tags** — `Contact.tags[]`, used for campaign audience segmentation.
- **Lead Status** — `LeadStatus` model, CRM pipeline stage on a contact.
- **Contact Labels** — `ContactLabel → Label`, color-coded labels on a contact record.

Conversation Labels are inbox-only. They live on a `Conversation`, not a `Contact`.

---

## Constraints (Interakt parity)

- **1 label per conversation** at any given time.
- Labels are created on-the-fly from the inbox (no pre-creation step required).
- Label name: max 22 characters, no special characters.
- Label color: randomly assigned at creation, consistent forever after within the org.
- No limit on number of unique labels per org.
- "Clear" removes the label and returns the conversation to unlabeled state.
- Independent of the existing `Label` / `ContactLabel` / `MessageLabel` system.

---

## Data Model

### New model: `InboxLabel`

Org-level palette of conversation labels. Created on first use.

```prisma
model InboxLabel {
  id             String              @id @default(uuid())
  organizationId String              @map("organization_id")
  name           String
  color          String              // hex color, e.g. "#F59E0B"
  createdAt      DateTime            @default(now()) @map("created_at")

  conversationLabels ConversationLabel[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("inbox_labels")
}
```

### New model: `ConversationLabel`

The assignment — one row per conversation maximum.

```prisma
model ConversationLabel {
  id             String       @id @default(uuid())
  conversationId String       @unique @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  inboxLabelId   String       @map("inbox_label_id")
  inboxLabel     InboxLabel   @relation(fields: [inboxLabelId], references: [id], onDelete: Cascade)
  assignedAt     DateTime     @default(now()) @map("assigned_at")

  @@index([inboxLabelId])
  @@map("conversation_labels")
}
```

`@unique` on `conversationId` is the DB-level enforcer of the 1-label-per-conversation rule.

### `Conversation` model update

Add relation:

```prisma
conversationLabel ConversationLabel?
```

### Color palette

12 distinct hex colors, hardcoded in the API layer. Picked randomly at `InboxLabel` creation. No user color selection.

```ts
const LABEL_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6",
  "#8B5CF6", "#EC4899", "#F43F5E", "#6B7280",
];
```

---

## API

### New route file: `apps/api/src/routes/inbox-labels.ts`

#### `GET /v1/inbox-labels`

Returns all `InboxLabel`s for the org. Used for autocomplete in the inbox dropdown.

**Response:**
```json
{
  "data": [
    { "id": "uuid", "name": "Billing Issue", "color": "#EF4444", "count": 3 }
  ]
}
```

`count` = number of conversations currently assigned this label.

---

#### `PUT /v1/conversations/:id/label`

Assigns a label to a conversation. Creates the `InboxLabel` if it doesn't exist.

**Body:**
```json
{ "name": "Billing Issue" }
```

**Validation:**
- `name` required, trimmed.
- Max 22 characters after trim.
- Only alphanumeric + spaces + hyphens (no special chars).

**Logic:**
1. Verify conversation belongs to org.
2. Upsert `InboxLabel` by `(organizationId, name)` — create with random color if new.
3. Upsert `ConversationLabel` by `conversationId` — replace `inboxLabelId` if one already exists.

**Response:** `200` with `{ label: { id, name, color } }`

---

#### `DELETE /v1/conversations/:id/label`

Clears the label from a conversation.

**Logic:** Delete `ConversationLabel` where `conversationId = :id` and verify org ownership.

**Response:** `204`

---

### Updated existing endpoints

`GET /v1/conversations` (list) and `GET /v1/conversations/:id` (single) — include `label` in the response:

```json
{
  "label": { "id": "uuid", "name": "Billing Issue", "color": "#EF4444" } | null
}
```

Add `labelId` as an optional query param to `GET /v1/conversations`:

```
GET /v1/conversations?labelId=<inboxLabelId>
```

Filters the list to conversations with that label assigned.

---

## Inbox UI

### 1. ConversationList (`apps/web/components/inbox/ConversationList.tsx`)

- Each conversation row renders a small colored badge pill (label name + color dot) below the contact name / message preview if `conversation.label` is present.
- Adds a "Label" option to the existing filter panel. Selecting a label from the dropdown sets `?labelId=<id>` on the conversations query.
- Label list for the filter dropdown fetched from `GET /v1/inbox-labels`.

### 2. ConversationHeader (`apps/web/components/inbox/ConversationHeader.tsx`)

- "Add label" button rendered beneath the contact name (no label assigned state).
- When a label is assigned: shows colored badge + "×" clear button.
- Clicking "Add label" or the badge opens an inline dropdown:
  - Text input (type to filter existing labels, autocomplete against `GET /v1/inbox-labels`).
  - Matching labels listed with color dot + name.
  - If typed name has no match: "Create `<name>`" option at the bottom.
  - Pressing Enter or clicking an option calls `PUT /v1/conversations/:id/label`.
  - Clicking "×" calls `DELETE /v1/conversations/:id/label`.
- Character limit enforced in the input (22 chars max).

### 3. ContactPanel (`apps/web/components/inbox/ContactPanel.tsx`)

No changes. Conversation Labels are inbox-only.

---

## Settings Page

New page: `apps/web/app/(dashboard)/settings/inbox-labels/`

- Shows a table of all org `InboxLabel`s: color dot, name, active conversation count, Delete button.
- **Delete:** Removes `InboxLabel` row (cascades to all `ConversationLabel` rows — those conversations return to unlabeled).
- **No rename.** No "Create" button (labels created from inbox only).
- Linked from the Settings nav alongside the existing Tags and Labels pages.
- Data fetched server-side from `GET /v1/inbox-labels`.

---

## Migration

Hand-authored SQL (local DB is drifted; `prisma migrate dev` fails — see project memory).

```sql
CREATE TABLE inbox_labels (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  TEXT NOT NULL,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_inbox_labels_org ON inbox_labels(organization_id);

CREATE TABLE conversation_labels (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id  TEXT NOT NULL UNIQUE,
  inbox_label_id   TEXT NOT NULL,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_label FOREIGN KEY (inbox_label_id) REFERENCES inbox_labels(id) ON DELETE CASCADE
);
CREATE INDEX idx_conv_labels_label ON conversation_labels(inbox_label_id);
```

---

## Out of Scope

- Label rename (Interakt doesn't have it).
- User color selection (random assignment only).
- Label history / audit log.
- Multiple labels per conversation.
- Applying conversation labels via automation flows (future M5).
