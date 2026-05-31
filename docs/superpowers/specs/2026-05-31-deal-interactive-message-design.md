# Deal Interactive Message — Design Spec

**Date:** 2026-05-31  
**Status:** Approved

## Problem

Deal notifications currently send a plain text message to the contact. The contact has no structured way to respond — they must type a reply. Agents want contacts to be able to Accept, Reject, or Negotiate a deal via WhatsApp buttons. Additionally, deal notification messages must always appear in the agent inbox.

## Goals

1. Replace plain-text deal notifications with WhatsApp interactive button messages (Accept / Reject / Negotiate)
2. Show the agent a preview of the message before it is sent
3. Guarantee the sent message is always visible in the agent inbox (never a system message)
4. When the contact taps a button, their reply appears in the inbox — agent acts manually (no auto stage update)

## Out of Scope

- Automatic deal stage updates based on contact reply
- Configurable button labels (fixed: Accept / Reject / Negotiate)
- New API endpoints (uses existing `/conversations/:id/messages`)

---

## Design

### 1. DealSlideOver UI (`apps/web/components/deals/DealSlideOver.tsx`)

**Trigger:** Agent toggles "Notify contact on save"

**New behavior:**
- Toggle expands an inline preview card below it (no modal)
- Preview card renders the exact WhatsApp message the contact will receive:
  - Header: `Deal: {title}`
  - Body: `Value: {value}\n\n{notes}`
  - Footer: `Reply using the buttons below`
  - Buttons: `✓ Accept` · `✗ Reject` · `~ Negotiate`
- If notes are empty → warning shown: *"Add notes to give the contact context before sending."* Send is blocked.
- If no linked contact or no WhatsApp conversation exists → toggle is disabled with tooltip: *"No WhatsApp conversation found for this contact."*

**Save actions (replaces current single Save button when toggle is on):**
- **Save & Send** (primary) — saves deal and sends interactive message
- **Save without notifying** (secondary) — saves deal, does not send

### 2. Interactive Message Payload

Sent to existing endpoint: `POST /v1/conversations/:id/messages`

```json
{
  "contentType": "interactive",
  "isSystemMessage": false,
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "Deal: {title}" },
    "body": { "text": "Value: {value}\n\n{notes}" },
    "footer": { "text": "Reply using the buttons below" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "deal_accept_{dealId}", "title": "✓ Accept" } },
        { "type": "reply", "reply": { "id": "deal_reject_{dealId}", "title": "✗ Reject" } },
        { "type": "reply", "reply": { "id": "deal_negotiate_{dealId}", "title": "~ Negotiate" } }
      ]
    }
  }
}
```

Button IDs embed `dealId` so the agent can identify which deal the reply refers to in the inbox thread.

### 3. Server-Side Inbox Visibility Guarantee (`apps/api/src/routes/messages.ts`)

Add one guard in the POST `/conversations/:id/messages` handler:

```typescript
if (body.contentType === "interactive") {
  body.isSystemMessage = false;
}
```

This makes inbox visibility a server-side invariant — no client can accidentally hide an interactive message.

### 4. Agent Inbox Display

- **Sent message:** Renders via existing `InteractiveMessageBubble` component — header, body text, and three buttons shown visually. No component changes needed.
- **Contact reply:** Inbound worker already handles `button_reply` and creates an inbound message. Reply appears as a normal inbound bubble showing the button title (e.g., *"✓ Accept"*). Agent sees it immediately and acts manually.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/components/deals/DealSlideOver.tsx` | Replace text notification logic with interactive preview + Send/Cancel UI. Conversation lookup already exists: `GET /v1/conversations?contactId=X&limit=1` — reuse it. |
| `apps/api/src/routes/messages.ts` | Add `isSystemMessage = false` guard for interactive messages |

No schema changes. No new endpoints. No new components.

---

## Flow Summary

```
Agent saves deal + "Notify contact" ON
  → Preview card shown in DealSlideOver
  → Agent clicks "Save & Send"
  → POST /conversations/:id/messages (contentType: interactive)
  → Server forces isSystemMessage: false
  → WhatsApp delivers interactive message to contact
  → Message appears in agent inbox via InteractiveMessageBubble
  → Contact taps Accept / Reject / Negotiate
  → Inbound worker creates button_reply message
  → Reply appears in agent inbox thread
  → Agent acts manually
```
