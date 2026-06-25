# AI Intent Matching — Design Spec

**Date:** 2026-06-25
**Status:** Approved for implementation
**Module:** M5 — AI Agents & Automation

---

## 1. Overview

AI Intent Matching routes inbound WhatsApp messages to the correct auto-reply or flow using GPT-4o-mini, without requiring customers to use exact keywords. It mirrors the Interakt feature exactly.

**Key properties:**
- Zero setup — AI reads existing auto-replies and flows automatically.
- Parallel to keyword matching — keyword match fires first; AI matching only runs when no keyword matches.
- Analysis is always free; billed only on a successful match.
- Price is ₹0 at launch (field exists; can be raised without code changes).
- A `CreditLedger` record is written on every match, even at ₹0, for audit trail.
- Non-blocking — a failure must never interrupt message delivery.

---

## 2. Data Model

### 2a. `OrgAutomationSettings` — two new fields

```prisma
// AI Intent Matching
intentMatchingEnabled  Boolean @default(false) @map("intent_matching_enabled")
intentMatchCostPaise   Int     @default(0)      @map("intent_match_cost_paise")
```

`intentMatchCostPaise` stores the per-match price in paise (₹0.20 = 20 paise). Starts at 0. Raising it later requires only a DB update, not a code change.

### 2b. `CreditType` enum — one new value

```prisma
enum CreditType {
  purchase
  message_sent
  call_made
  refund
  adjustment
  intent_match   // ← new
}
```

### 2c. `CreditLedger` — no schema change

The existing `notes` column stores the matched entity as `"auto_reply:<id>"` or `"flow:<id>"` for audit trail.

---

## 3. AI Matching Function

New function `matchIntentToAutomation` added to `apps/api/src/lib/claude.ts`.

**Signature:**
```ts
interface IntentCandidate {
  id: string;
  type: "auto_reply" | "flow";
  name: string;
  keyword: string;
  preview: string; // first 120 chars of replyText or flow description
}

interface IntentMatchResult {
  matchedId: string | null;
  matchType: "auto_reply" | "flow" | null;
  confidence: number; // 0.0–1.0
}

async function matchIntentToAutomation(
  messageBody: string,
  candidates: IntentCandidate[]
): Promise<IntentMatchResult>
```

**Prompt (single call to gpt-4o-mini):**
> A customer sent this WhatsApp message: `"{messageBody}"`
>
> Available automations:
> `[{id, type, name, keyword, preview}]`
>
> Pick the automation that best matches the customer's intent. If none fits, return null.
> Respond with JSON only: `{"matchedId": "<id or null>", "matchType": "<auto_reply|flow|null>", "confidence": <0.0–1.0>}`

**Confidence threshold:** 0.7. Below this, no match fires (message passes through with no automation, free of charge).

**Candidate limit:** up to 30 active auto-replies + active flows. If an org has more, the 30 highest-priority are used (auto-replies ordered by `priorityIndex`, flows ordered by `createdAt` desc).

---

## 4. Intent Matcher Module

New file: `apps/api/src/lib/intent-matcher.ts`

**Responsibility:** fetch candidates, call the AI function, fire the matched automation, write the ledger entry.

**Signature:**
```ts
export async function runIntentMatching(
  prisma: PrismaClient,
  organizationId: string,
  messageBody: string,
  conversationId: string,
  contactPhone: string,
  org: { phoneNumberId: string; wabaAccessToken: string }
): Promise<void>
```

**Internal flow:**
1. Fetch `OrgAutomationSettings` — if `!intentMatchingEnabled`, return immediately.
2. Fetch all active auto-replies (ordered by `priorityIndex asc`).
3. Fetch all active flows (ordered by `createdAt desc`).
4. Build `candidates` array: auto-replies first, then flows, capped at 30 total. If empty, return.
5. Call `matchIntentToAutomation(messageBody, candidates)`.
6. If `matchedId === null` or `confidence < 0.7`, return (no charge, no action).
7. Fire the matched automation:
   - `type === "auto_reply"`: send `replyText` via `sendTextMessage`; if `matched.flowId`, also `runFlow`.
   - `type === "flow"`: call `runFlow`.
8. Write `CreditLedger` entry:
   ```ts
   { organizationId, credits: BigInt(-settings.intentMatchCostPaise), type: "intent_match",
     notes: `${matchType}:${matchedId}` }
   ```
   (At launch `credits = 0n` since `intentMatchCostPaise = 0`.)

All steps are wrapped in a try/catch — errors are logged and swallowed.

---

## 5. Worker Integration

Integration point: `apps/api/src/workers/inbound-message.worker.ts`, immediately after the existing keyword auto-reply block (lines 328–361).

```ts
// Existing keyword block (unchanged)
const matched = autoReplies.find((ar) => matchesAutoReply(ar.triggerType, ar.triggerKeyword, body));
if (matched) {
  // ... existing fire logic
}

// ← NEW: AI intent matching (fallback when keyword doesn't match)
if (!matched && body && refreshed?.status !== "bot" && org?.phoneNumberId && org?.wabaAccessToken && fullContact) {
  void runIntentMatching(
    prisma, organizationId, body, conversation.id, whatsappContactPhone,
    { phoneNumberId: org.phoneNumberId, wabaAccessToken: org.wabaAccessToken }
  ).catch(() => { /* swallow — never break delivery */ });
}
```

Guards (same as keyword block):
- Only text messages with a `body`.
- Only when conversation status is not `"bot"`.
- Only when `org.phoneNumberId` and `org.wabaAccessToken` exist.
- Non-blocking (`void` + `.catch()`).

---

## 6. API Routes

Added to `apps/api/src/routes/automation-settings.ts`.

### `GET /v1/automation/settings/intent-matching`
Returns:
```json
{ "data": { "intentMatchingEnabled": false, "intentMatchCostPaise": 0 } }
```

### `PUT /v1/automation/settings/intent-matching`
Body: `{ "intentMatchingEnabled": boolean }`

Required permission: `automation_access`.

Upserts `OrgAutomationSettings`. Returns updated settings.

---

## 7. Web UI

### Route
New page: `apps/web/app/(dashboard)/flows/ai-intent-matching/page.tsx`

### Navigation
Sidebar item "AI Intent Matching" added under the Flows section, between "Custom Auto Reply" and "Workflows" — matches Interakt's nav order.

### Page layout (mirrors Interakt exactly)

**Header row:**
- Left: icon + "AI Intent Matching" title + "Get AI to select your reply to customers" subtitle
- Right: "Enable AI Intent Match" toggle button (green when on, gray when off)

**Explainer card:**
> AI Intent Matching understands what your customers are asking and automatically triggers the correct auto-reply or chatbot workflow that you've already set up. Your existing flows stay exactly the same — they just become smarter.

Three feature points:
1. **Understands messages** — AI understands customer messages even when keywords don't match.
2. **Triggers the right automation** — Ensures the correct auto-reply or chatbot flow fires.
3. **Zero setup required** — Works instantly with everything you already built.

**Pricing banner (yellow/amber):**
> ⓘ Free per successful intent match (₹0 per match). Charges are automatically deducted from your wallet. [How pricing works? →]

"How pricing works?" opens a modal:
- Title: "AI Intent Match Pricing"
- "You are charged only when AI successfully matches intent — not for every query."
- Bullet list: AI analyzes all incoming queries for free · Charged only on a successful match · No charge for unmatched queries · Charges deducted from wallet
- Example box: "100 queries, 10 match → 10 × ₹0 = ₹0 total. The other 90 queries are free."

**Things to know section (light blue):**
- "Before enabling AI Intent Matching, make sure you have created sufficient auto-replies & workflows."
- "AI Intent Matching works by intelligently routing customer messages to your existing automations. It will be useful only if you have auto-replies or workflows covering different topics customers might reach out for."
- CTA links: "Set up Auto-Replies →" (`/flows/auto-replies`) · "Create Workflows →" (`/flows`)

### Client component behaviour
- On mount: `GET /v1/automation/settings/intent-matching` to read current state.
- Toggle click: `PUT /v1/automation/settings/intent-matching` with toggled value.
- Toggle is disabled while the fetch/save is in flight.
- No page reload needed.

---

## 8. Error Handling

| Scenario | Handling |
|---|---|
| AI call throws / times out | Logged, swallowed — message delivery continues |
| Confidence < 0.7 | No action, no charge — message passes through |
| No active auto-replies or flows | `runIntentMatching` returns immediately (no AI call) |
| `sendTextMessage` fails after AI match | Logged, swallowed — ledger entry is still written |
| `CreditLedger` write fails | Logged, swallowed — automation still fires |
| Org has insufficient credits | Not checked at ₹0 launch. Will be enforced when price > 0 |

---

## 9. Out of Scope (This Sprint)

- Usage analytics / match history dashboard (future)
- Per-automation opt-in/opt-out from AI matching (all active automations are always candidates)
- Billing enforcement / credit-balance gate (will be added when price > 0)
- A/B testing keyword vs. AI match

---

## 10. File Changelist

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `intentMatchingEnabled`, `intentMatchCostPaise` to `OrgAutomationSettings`; add `intent_match` to `CreditType` |
| `apps/api/prisma/migrations/` | Auto-generated migration |
| `apps/api/src/lib/claude.ts` | Add `matchIntentToAutomation` function |
| `apps/api/src/lib/intent-matcher.ts` | New file: `runIntentMatching` |
| `apps/api/src/routes/automation-settings.ts` | Add GET + PUT for `/intent-matching` |
| `apps/api/src/workers/inbound-message.worker.ts` | Add `runIntentMatching` call after keyword block |
| `apps/web/app/(dashboard)/flows/ai-intent-matching/page.tsx` | New page |
| `apps/web/components/layout/Sidebar.tsx` (or equivalent) | Add nav item |
