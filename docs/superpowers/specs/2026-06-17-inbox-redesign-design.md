# Inbox Redesign — Design Spec

**Date:** 2026-06-17  
**Scope:** `apps/web` (inbox page + components) · `apps/api` (conversations + contacts routes)  
**Status:** Approved, pending implementation

---

## Problem

The current inbox has four UX bugs and is missing key CRM features that would make it meaningfully better than WhatsApp Web for agents:

**Bugs:**
1. Double scrollbar — conversation list and message thread both show scrollbars simultaneously
2. Message thread doesn't scroll to bottom on load / new conversation selection
3. No date separators between messages grouped by day
4. BotPanel renders below the compose bar as an accordion, breaking the layout

**Missing features:**
5. No search — neither by contact name nor message content
6. No message preview in conversation list (can't triage without opening each conversation)
7. No way to change conversation status from the inbox
8. No contact context panel — agents must navigate away to see contact details

---

## Layout — 3 Column

```
┌──────────┬───────────────┬──────────────────────────┬────────────────┐
│ App nav  │  Sidebar      │  Message thread          │  Contact panel │
│ (exists) │  w-72         │  flex-1                  │  w-80          │
│          │               │                          │  (toggleable)  │
└──────────┴───────────────┴──────────────────────────┴────────────────┘
```

- **Column 2 (sidebar):** gains search bar, message preview, intent tag per row
- **Column 3 (thread):** fixes scroll, adds date separators, status dropdown in header, ℹ️ toggle for contact panel
- **Column 4 (contact panel):** new, slides in/out via `translate-x` transition, no page navigation

---

## Section 1 — Conversation Sidebar

### Search bar
- Always visible at the top of the sidebar above the tabs
- Input: `placeholder="Search conversations…"`, has a ✕ clear button when active
- Debounce: 300ms before firing
- While search query is active: status tabs (All/Open/Pending/Closed) are hidden
- Calls `GET /v1/conversations/search?q=` (see API section)
- Clearing search restores tabs and normal list

### Conversation row
```
Devendra Sharma                18:04
To check your order status…    🔵 2
🟠 complaint
```
- Line 1: contact name (truncated) + timestamp (right-aligned)
- Line 2: last message preview (1 line, truncated). Outbound messages prefixed with `✓✓ `. Unread badge moves here (was beside the name).
- Line 3: AI intent tag — shown only if `detectIntent` has returned a result for the latest inbound message. Use the existing `IntentBadge` component already in the codebase (`apps/web/components/intent-badge.tsx`). Hidden if no intent detected.
- Selected state: `bg-brand-50`

### Data change
`GET /v1/conversations` response must include `lastMessage: { body, direction, contentType }` on each conversation object.

---

## Section 2 — Message Thread

### Scroll fix
- Outer panel (`flex flex-col flex-1`): add `min-h-0` so flex children can't overflow their container
- `MessageThread` root div: `flex-1 min-h-0 overflow-y-auto` (was `flex-1 overflow-y-auto` — missing `min-h-0`)
- On initial load / conversation switch: scroll to bottom **instantly** (`behavior: "auto"`)
- On new message arrival: scroll to bottom **smoothly** (`behavior: "smooth"`)
- All siblings below `MessageThread` (bot indicator, CannedResponsePicker row, SendMessageForm) must have `shrink-0`

### Date separators
Inserted between message groups that fall on different calendar days.

Label logic:
- Same calendar day as today → "Today"
- One day before today → "Yesterday"
- Older → "15 Jun 2026" (formatted as `DD MMM YYYY`)

Rendered as:
```html
<div class="flex items-center gap-3 my-3">
  <div class="flex-1 h-px bg-gray-200" />
  <span class="text-xs text-gray-400 font-medium">Today</span>
  <div class="flex-1 h-px bg-gray-200" />
</div>
```

Grouping is done inside `MessageThread` — iterate messages, compare `sentAt` date to previous message's `sentAt` date, insert separator when date changes.

### Conversation header
```
[DS avatar]  Devendra Sharma
             Open ▾  [lead] [csat-poor]          👤  ℹ️
```
- **Status dropdown**: clicking the status badge ("Open") shows a small dropdown — Open / Pending / Closed. Selecting calls `PATCH /v1/conversations/:id` with `{ status }`. Already implemented on the API.
- **👤 icon**: placeholder assign button (renders the icon, no logic yet — assignee feature is out of scope)
- **ℹ️ icon**: toggles the contact detail panel (column 4). State lives in `InboxPage`.

---

## Section 3 — Compose Bar

```
[ ⚡ ][ 📋 ][ 📎 ][ 🤖 ]   [ Type a message… or /      ]  [ Send ]
```

- **🤖 (BotPanel icon)**: new icon added to the compose toolbar. Clicking opens a small popover above the bar listing active bots for the conversation. Replaces the "Bot Automations" accordion that currently renders below `SendMessageForm`.
- `BotPanel` component is removed from `InboxPage` render tree. Its content (bot list + quick-send buttons) is moved into a popover inside `SendMessageForm`.
- The separate `CannedResponsePicker + SmartReplyPanel` row (currently rendered between `MessageThread` and `SendMessageForm` in `InboxPage`) is moved inside `SendMessageForm` so the compose area is one self-contained component.

---

## Section 4 — Contact Detail Panel

Toggleable right sidebar, `w-80`, slides in with `transition-transform duration-200`.

**Sections (top to bottom):**

| Section | Content | Source |
|---|---|---|
| Identity | Avatar initials, full name, phone, email | `contact` (already fetched in `InboxPage`) |
| Tags | Tag pills (display only), "+ Add" placeholder | `contact.tags` |
| Trust Score | Score bar + number | `ContactTrustBadge` (reuse existing component) |
| Deals | List of deals or "No deals yet" + "Create" → `CreateOfferModal` | `contact.id` |
| Notes | Textarea bound to `contact.notes`, saves on blur via `PATCH /v1/contacts/:id` | `contact.notes` (field exists in schema) |
| Contact Details | First contact date, last message time, current status | `contact.createdAt`, `conversation.lastMessageAt` |

**State:** `contactPanelOpen: boolean` in `InboxPage`, toggled by ℹ️ button.  
**No new API call** for the basic panel — all data comes from the `contact` object already available in `InboxPage`.

---

## Section 5 — API Changes

### New: `GET /v1/conversations/search`

```
Auth:    Clerk JWT — org-scoped (organizationId always in WHERE)
Query:   q: string (min 2 chars, trimmed)
Limit:   20 results
Returns: same Conversation shape as GET /v1/conversations (+ lastMessage)

Prisma:
  conversations where:
    organizationId = req.orgId
    AND (
      contact.firstName ILIKE %q%
      OR contact.lastName ILIKE %q%
      OR messages.some({ body ILIKE %q% })
    )
  include: { contact, lastMessage: { orderBy: sentAt desc, take: 1 } }
  take: 20
```

### Modified: `GET /v1/conversations`

Add `lastMessage` to the include — the single most recent message per conversation:
```typescript
include: {
  contact: true,
  messages: { orderBy: { sentAt: "desc" }, take: 1 },  // rename to lastMessage in response
}
```

### No schema migration needed
- `Contact.notes` already exists (`String? @db.Text`)
- `PATCH /v1/contacts/:id` already exists
- `PATCH /v1/conversations/:id` status update already exists

---

## Files Changed

### API
| File | Change |
|---|---|
| `apps/api/src/routes/conversations.ts` | Add `GET /search` route + include `lastMessage` in list response |

### Web
| File | Change |
|---|---|
| `apps/web/app/(dashboard)/inbox/page.tsx` | Add `contactPanelOpen` state, pass to thread header + contact panel; remove standalone `CannedResponsePicker` row and `BotPanel` |
| `apps/web/components/inbox/ConversationList.tsx` | Add search bar, message preview line, intent tag |
| `apps/web/components/inbox/MessageThread.tsx` | Add date separators, fix `min-h-0` scroll bug, fix initial scroll behaviour |
| `apps/web/components/inbox/SendMessageForm.tsx` | Add 🤖 bot icon + popover (absorbs BotPanel logic); absorb `CannedResponsePicker` + `SmartReplyPanel` |
| `apps/web/components/inbox/ContactPanel.tsx` | **New component** — right sidebar with contact details, notes, deals |
| `apps/web/components/inbox/ConversationHeader.tsx` | **New component** — extracts header from `page.tsx`, adds status dropdown + panel toggle icons |

---

## Out of Scope

- Assignee / team routing (👤 button rendered but no logic)
- Tag editing from the contact panel
- Real-time search (search fires on query, not on WS push)
- Message read receipts in the contact panel timeline
