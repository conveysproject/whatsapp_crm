# AI Intent Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered intent matching that automatically routes inbound WhatsApp messages to the correct auto-reply or flow when keyword matching finds no match.

**Architecture:** A new `runIntentMatching` lib function sits between keyword-based auto-reply matching and the rest of the inbound worker pipeline. It calls GPT-4o-mini with the message body and a list of active automations as candidates, then fires the best match if confidence ≥ 0.7. Toggle lives in `OrgAutomationSettings`. Billing records a `CreditLedger` entry on every successful match (₹0 at launch).

**Tech Stack:** Prisma 7, Fastify 4, gpt-4o-mini (OpenAI), Next.js 15 App Router, React 18, Tailwind CSS, Vitest.

## Global Constraints

- TypeScript strict mode — no `any`, no implicit returns.
- API files use ESM `.js` extensions in imports even for `.ts` source files.
- No `console.log` in production API code — use `request.log` or pino. Use `console.error` only in workers for error paths.
- Named exports only in shared packages — no default exports.
- All Prisma queries must be scoped to `organizationId`.
- Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`.
- Run `pnpm --filter @WBMSG/api test` and `pnpm --filter @WBMSG/api lint` before each commit.
- Run migration from repo root: `npx prisma migrate dev --name <name>`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add `intentMatchingEnabled`, `intentMatchCostPaise` to `OrgAutomationSettings`; add `intent_match` to `CreditType` |
| `apps/api/src/lib/claude.ts` | Modify | Add `matchIntentToAutomation` + exported types |
| `apps/api/src/lib/intent-matcher.ts` | Create | `runIntentMatching` — fetch candidates, call AI, fire automation, write ledger |
| `apps/api/src/lib/intent-matcher.test.ts` | Create | Unit tests for `runIntentMatching` |
| `apps/api/src/routes/automation-settings.ts` | Modify | Add `GET` + `PUT /v1/automation/settings/intent-matching` |
| `apps/api/src/routes/automation-settings.test.ts` | Modify | Tests for the two new routes |
| `apps/api/src/workers/inbound-message.worker.ts` | Modify | Call `runIntentMatching` after keyword block fails |
| `apps/web/components/layout/Sidebar.tsx` | Modify | Add "AI Intent Matching" nav item under Flows |
| `apps/web/app/(dashboard)/flows/ai-intent-matching/page.tsx` | Create | Client page with toggle, explainer, pricing modal, "Things to know" |

---

## Task 1: Database Schema + Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `OrgAutomationSettings.intentMatchingEnabled: Boolean`, `OrgAutomationSettings.intentMatchCostPaise: Int`, `CreditType.intent_match`

- [ ] **Step 1: Add `intent_match` to `CreditType` enum**

In `apps/api/prisma/schema.prisma`, find the `CreditType` enum (currently around line 421) and add the new value:

```prisma
enum CreditType {
  purchase
  message_sent
  call_made
  refund
  adjustment
  intent_match
}
```

- [ ] **Step 2: Add two fields to `OrgAutomationSettings`**

Find the `OrgAutomationSettings` model (currently around line 1435). Add after the `delayedSendWithOoo` line and before `createdAt`:

```prisma
  // AI Intent Matching
  intentMatchingEnabled  Boolean @default(false) @map("intent_matching_enabled")
  intentMatchCostPaise   Int     @default(0)      @map("intent_match_cost_paise")
```

The model's closing section should look like:

```prisma
  // Delayed Response
  delayedEnabled     Boolean @default(false) @map("delayed_enabled")
  delayedMinutes     Int     @default(30)    @map("delayed_minutes")
  delayedMessage     String? @map("delayed_message")
  delayedMessageData Json?   @map("delayed_message_data")
  delayedSendWithOoo Boolean @default(false) @map("delayed_send_with_ooo")

  // AI Intent Matching
  intentMatchingEnabled  Boolean @default(false) @map("intent_matching_enabled")
  intentMatchCostPaise   Int     @default(0)      @map("intent_match_cost_paise")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name add_intent_matching
```

Expected output ends with: `✔ Generated Prisma Client`

- [ ] **Step 4: Verify generated client**

```bash
npx prisma generate
```

Expected: exits 0 with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): add intent_match credit type and intent matching settings fields"
```

---

## Task 2: AI Matching Function

**Files:**
- Modify: `apps/api/src/lib/claude.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface IntentCandidate {
    id: string;
    type: "auto_reply" | "flow";
    name: string;
    keyword: string;
    preview: string;
  }
  export interface IntentMatchResult {
    matchedId: string | null;
    matchType: "auto_reply" | "flow" | null;
    confidence: number;
  }
  export async function matchIntentToAutomation(
    messageBody: string,
    candidates: IntentCandidate[]
  ): Promise<IntentMatchResult>
  ```

- [ ] **Step 1: Add exported interfaces to `claude.ts`**

Open `apps/api/src/lib/claude.ts`. After the existing `SentimentType` export (line 11), add:

```ts
export interface IntentCandidate {
  id: string;
  type: "auto_reply" | "flow";
  name: string;
  keyword: string;
  preview: string; // first 120 chars of replyText or flow name
}

export interface IntentMatchResult {
  matchedId: string | null;
  matchType: "auto_reply" | "flow" | null;
  confidence: number; // 0.0–1.0
}
```

- [ ] **Step 2: Add `matchIntentToAutomation` function at end of file**

Append to the bottom of `apps/api/src/lib/claude.ts`:

```ts
export async function matchIntentToAutomation(
  messageBody: string,
  candidates: IntentCandidate[]
): Promise<IntentMatchResult> {
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. id="${c.id}" type="${c.type}" name="${c.name}" keyword="${c.keyword}" preview="${c.preview}"`
    )
    .join("\n");

  const response = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: 100,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You match customer WhatsApp messages to automations. Return JSON only.",
      },
      {
        role: "user",
        content: `Customer message: "${messageBody}"\n\nAvailable automations:\n${list}\n\nWhich automation best matches the customer's intent? If none fits well, use null.\nReturn JSON: {"matchedId": "<id or null>", "matchType": "<auto_reply|flow|null>", "confidence": <0.0-1.0>}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(text(response)) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "matchedId" in parsed &&
      "matchType" in parsed &&
      "confidence" in parsed
    ) {
      return parsed as IntentMatchResult;
    }
  } catch {
    /* fallthrough */
  }
  return { matchedId: null, matchType: null, confidence: 0 };
}
```

- [ ] **Step 3: Run type-check to confirm no errors**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/claude.ts
git commit -m "feat(ai): add matchIntentToAutomation function"
```

---

## Task 3: Intent Matcher Module

**Files:**
- Create: `apps/api/src/lib/intent-matcher.ts`
- Create: `apps/api/src/lib/intent-matcher.test.ts`

**Interfaces:**
- Consumes:
  - `matchIntentToAutomation(messageBody, candidates): Promise<IntentMatchResult>` from `./claude.js`
  - `sendTextMessage(phoneNumberId, to, text, token): Promise<{ messageId: string }>` from `./whatsapp.js`
  - `recordOutbound(prisma, { conversationId, organizationId, contentType, body, whatsappMessageId }): Promise<void>` from `./record-outbound.js`
  - `runFlow(prisma, flowId, flowDefinition, context): Promise<void>` from `./flow-runner.js`
- Produces: `export async function runIntentMatching(prisma, organizationId, messageBody, conversationId, contactPhone, org): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/intent-matcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("./claude.js", () => ({
  matchIntentToAutomation: vi.fn(),
}));
vi.mock("./whatsapp.js", () => ({
  sendTextMessage: vi.fn(),
}));
vi.mock("./record-outbound.js", () => ({
  recordOutbound: vi.fn(),
}));
vi.mock("./flow-runner.js", () => ({
  runFlow: vi.fn(),
}));

import { matchIntentToAutomation } from "./claude.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";
import { runFlow } from "./flow-runner.js";
import { runIntentMatching } from "./intent-matcher.js";

const mockMatchIntentToAutomation = vi.mocked(matchIntentToAutomation);
const mockSendTextMessage = vi.mocked(sendTextMessage);
const mockRecordOutbound = vi.mocked(recordOutbound);
const mockRunFlow = vi.mocked(runFlow);

const ORG = { phoneNumberId: "ph-1", wabaAccessToken: "tok-1" };
const ORG_ID = "org-1";
const CONV_ID = "conv-1";
const PHONE = "+911234567890";
const BODY = "I want to track my order";

function makePrisma(overrides?: {
  settings?: object | null;
  autoReplies?: object[];
  flows?: object[];
  contact?: object | null;
  flow?: object | null;
}): PrismaClient {
  return {
    orgAutomationSettings: {
      findUnique: vi.fn().mockResolvedValue(
        overrides?.settings !== undefined
          ? overrides.settings
          : { intentMatchingEnabled: true, intentMatchCostPaise: 0 }
      ),
    },
    autoReply: {
      findMany: vi.fn().mockResolvedValue(
        overrides?.autoReplies ?? [
          {
            id: "ar-1",
            name: "Order Tracking",
            triggerKeyword: "track",
            replyText: "Sure, share your order ID.",
            flowId: null,
          },
        ]
      ),
    },
    flow: {
      findMany: vi.fn().mockResolvedValue(overrides?.flows ?? []),
      findFirst: vi.fn().mockResolvedValue(overrides?.flow ?? null),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(
        overrides?.contact !== undefined
          ? overrides.contact
          : { firstName: "Ali", lastName: null, phoneNumber: PHONE, email: null }
      ),
    },
    creditLedger: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendTextMessage.mockResolvedValue({ messageId: "wamid-1" });
  mockRecordOutbound.mockResolvedValue(undefined);
  mockRunFlow.mockResolvedValue(undefined);
});

describe("runIntentMatching", () => {
  it("returns early when intentMatchingEnabled is false", async () => {
    const prisma = makePrisma({ settings: { intentMatchingEnabled: false, intentMatchCostPaise: 0 } });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockMatchIntentToAutomation).not.toHaveBeenCalled();
  });

  it("returns early when settings record is null", async () => {
    const prisma = makePrisma({ settings: null });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockMatchIntentToAutomation).not.toHaveBeenCalled();
  });

  it("returns early when no candidates exist", async () => {
    const prisma = makePrisma({ autoReplies: [], flows: [] });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockMatchIntentToAutomation).not.toHaveBeenCalled();
  });

  it("returns early when AI confidence is below threshold", async () => {
    const prisma = makePrisma();
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.5,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it("returns early when AI returns no match", async () => {
    const prisma = makePrisma();
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: null,
      matchType: null,
      confidence: 0,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it("sends auto-reply text and writes ledger on confident match", async () => {
    const prisma = makePrisma();
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.9,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "ph-1", PHONE, "Sure, share your order ID.", "tok-1"
    );
    expect(mockRecordOutbound).toHaveBeenCalled();
    const ledgerCall = (prisma.creditLedger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ledgerCall.data.type).toBe("intent_match");
    expect(ledgerCall.data.notes).toBe("auto_reply:ar-1");
    expect(ledgerCall.data.credits).toBe(0n);
  });

  it("also runs linked flow when auto-reply has flowId", async () => {
    const prisma = makePrisma({
      autoReplies: [
        {
          id: "ar-1",
          name: "Order Tracking",
          triggerKeyword: "track",
          replyText: "On it!",
          flowId: "fl-1",
        },
      ],
      flow: { id: "fl-1", flowDefinition: {} },
    });
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.85,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockRunFlow).toHaveBeenCalledWith(
      prisma, "fl-1", {}, expect.objectContaining({ conversationId: CONV_ID })
    );
  });

  it("runs flow directly when matchType is flow", async () => {
    const prisma = makePrisma({
      autoReplies: [],
      flows: [{ id: "fl-1", name: "Order Bot", flowDefinition: {} }],
      flow: { id: "fl-1", flowDefinition: {} },
    });
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "fl-1",
      matchType: "flow",
      confidence: 0.8,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockRunFlow).toHaveBeenCalledWith(
      prisma, "fl-1", {}, expect.objectContaining({ conversationId: CONV_ID })
    );
  });

  it("interpolates {{first_name}} in auto-reply text", async () => {
    const prisma = makePrisma({
      autoReplies: [
        {
          id: "ar-1",
          name: "Greeting",
          triggerKeyword: "hi",
          replyText: "Hello {{first_name}}!",
          flowId: null,
        },
      ],
    });
    mockMatchIntentToAutomation.mockResolvedValue({
      matchedId: "ar-1",
      matchType: "auto_reply",
      confidence: 0.9,
    });
    await runIntentMatching(prisma, ORG_ID, BODY, CONV_ID, PHONE, ORG);
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "ph-1", PHONE, "Hello Ali!", "tok-1"
    );
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail with "cannot find module"**

```bash
pnpm --filter @WBMSG/api test intent-matcher
```

Expected: all tests fail with module not found.

- [ ] **Step 3: Create `apps/api/src/lib/intent-matcher.ts`**

```ts
import type { PrismaClient } from "@prisma/client";
import { matchIntentToAutomation, type IntentCandidate } from "./claude.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";
import { runFlow, type FlowDefinition } from "./flow-runner.js";

const CONFIDENCE_THRESHOLD = 0.7;
const MAX_CANDIDATES = 30;

function interpolate(
  body: string,
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null } | null
): string {
  if (!contact) return body;
  const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return body
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

export async function runIntentMatching(
  prisma: PrismaClient,
  organizationId: string,
  messageBody: string,
  conversationId: string,
  contactPhone: string,
  org: { phoneNumberId: string; wabaAccessToken: string }
): Promise<void> {
  const settings = await prisma.orgAutomationSettings.findUnique({
    where: { organizationId },
    select: { intentMatchingEnabled: true, intentMatchCostPaise: true },
  });
  if (!settings?.intentMatchingEnabled) return;

  const [autoReplies, flows] = await Promise.all([
    prisma.autoReply.findMany({
      where: { organizationId, isActive: true },
      orderBy: { priorityIndex: "asc" },
      select: { id: true, name: true, triggerKeyword: true, replyText: true, flowId: true },
    }),
    prisma.flow.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, flowDefinition: true },
    }),
  ]);

  const candidates: IntentCandidate[] = [
    ...autoReplies.map((ar) => ({
      id: ar.id,
      type: "auto_reply" as const,
      name: ar.name,
      keyword: ar.triggerKeyword,
      preview: ar.replyText.slice(0, 120),
    })),
    ...flows.map((f) => ({
      id: f.id,
      type: "flow" as const,
      name: f.name,
      keyword: "",
      preview: f.name,
    })),
  ].slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) return;

  const result = await matchIntentToAutomation(messageBody, candidates);
  if (!result.matchedId || result.confidence < CONFIDENCE_THRESHOLD) return;

  if (result.matchType === "auto_reply") {
    const matched = autoReplies.find((ar) => ar.id === result.matchedId);
    if (!matched) return;

    const contact = await prisma.contact.findFirst({
      where: { organizationId, phoneNumber: contactPhone },
      select: { firstName: true, lastName: true, phoneNumber: true, email: true },
    });

    const replyText = interpolate(matched.replyText, contact);
    if (replyText) {
      const { messageId } = await sendTextMessage(
        org.phoneNumberId, contactPhone, replyText, org.wabaAccessToken
      );
      await recordOutbound(prisma, {
        conversationId,
        organizationId,
        contentType: "text",
        body: replyText,
        whatsappMessageId: messageId,
      });
    }

    if (matched.flowId) {
      const flow = await prisma.flow.findFirst({
        where: { id: matched.flowId, isActive: true },
      });
      if (flow) {
        await runFlow(
          prisma,
          flow.id,
          flow.flowDefinition as unknown as FlowDefinition,
          { conversationId, organizationId, contactPhone, messageBody }
        );
      }
    }
  } else if (result.matchType === "flow") {
    const flow = await prisma.flow.findFirst({
      where: { id: result.matchedId, isActive: true },
    });
    if (flow) {
      await runFlow(
        prisma,
        flow.id,
        flow.flowDefinition as unknown as FlowDefinition,
        { conversationId, organizationId, contactPhone, messageBody }
      );
    }
  }

  await prisma.creditLedger.create({
    data: {
      organizationId,
      credits: BigInt(-settings.intentMatchCostPaise),
      type: "intent_match",
      notes: `${result.matchType}:${result.matchedId}`,
    },
  });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm --filter @WBMSG/api test intent-matcher
```

Expected: all 8 tests pass.

- [ ] **Step 5: Run lint**

```bash
pnpm --filter @WBMSG/api lint
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/intent-matcher.ts apps/api/src/lib/intent-matcher.test.ts
git commit -m "feat(automation): add runIntentMatching module with tests"
```

---

## Task 4: API Routes

**Files:**
- Modify: `apps/api/src/routes/automation-settings.ts`
- Modify: `apps/api/src/routes/automation-settings.test.ts`

**Interfaces:**
- Produces:
  - `GET /v1/automation/settings/intent-matching` → `{ data: { intentMatchingEnabled: boolean, intentMatchCostPaise: number } }`
  - `PUT /v1/automation/settings/intent-matching` body `{ intentMatchingEnabled?: boolean }` → same shape

- [ ] **Step 1: Add GET route to `automation-settings.ts`**

Open `apps/api/src/routes/automation-settings.ts`. Before the closing `};` of `automationSettingsRouter`, add:

```ts
  // --- GET Intent Matching Settings ---

  fastify.get("/automation/settings/intent-matching", async (request, reply) => {
    const { organizationId } = request.auth;
    const settings = await fastify.prisma.orgAutomationSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
      select: { intentMatchingEnabled: true, intentMatchCostPaise: true },
    });
    return reply.send({ data: settings });
  });
```

- [ ] **Step 2: Add PUT route to `automation-settings.ts`**

Immediately after the GET route added in Step 1, still before the closing `};`:

```ts
  // --- PUT Intent Matching Settings ---

  interface PutIntentMatchingBody {
    intentMatchingEnabled?: boolean;
  }

  fastify.put<{ Body: PutIntentMatchingBody }>(
    "/automation/settings/intent-matching",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { intentMatchingEnabled } = request.body;
      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...(intentMatchingEnabled !== undefined && { intentMatchingEnabled }),
        },
        update: {
          ...(intentMatchingEnabled !== undefined && { intentMatchingEnabled }),
        },
        select: { intentMatchingEnabled: true, intentMatchCostPaise: true },
      });
      return reply.send({ data: settings });
    }
  );
```

- [ ] **Step 3: Add the two new fields to `DEFAULT_SETTINGS` in the test file**

Open `apps/api/src/routes/automation-settings.test.ts`. Find `DEFAULT_SETTINGS` (around line 19) and add the new fields so the mock matches the updated schema:

```ts
const DEFAULT_SETTINGS = {
  id: "as-1",
  organizationId: "org-1",
  oooEnabled: false,
  oooMessage: null,
  oooMessageData: null,
  welcomeEnabled: false,
  welcomePersonalized: false,
  welcomeMessage: null,
  welcomeMessageData: null,
  welcomeNewMessage: null,
  welcomeNewData: null,
  welcomeReturningMessage: null,
  welcomeReturningData: null,
  welcomeFlowId: null,
  delayedEnabled: false,
  delayedMinutes: 30,
  delayedMessage: null,
  delayedMessageData: null,
  delayedSendWithOoo: false,
  intentMatchingEnabled: false,  // ← new
  intentMatchCostPaise: 0,       // ← new
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

- [ ] **Step 4: Write tests for the two new routes**

At the bottom of `apps/api/src/routes/automation-settings.test.ts`, append:

```ts
describe("GET /v1/automation/settings/intent-matching", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns intent matching settings", async () => {
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue({
      intentMatchingEnabled: false,
      intentMatchCostPaise: 0,
    });
    const res = await app.inject({
      method: "GET",
      url: "/v1/automation/settings/intent-matching",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { intentMatchingEnabled: boolean; intentMatchCostPaise: number } }>();
    expect(body.data.intentMatchingEnabled).toBe(false);
    expect(body.data.intentMatchCostPaise).toBe(0);
  });
});

describe("PUT /v1/automation/settings/intent-matching", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("enables intent matching", async () => {
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue({
      intentMatchingEnabled: true,
      intentMatchCostPaise: 0,
    });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/intent-matching",
      payload: { intentMatchingEnabled: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { intentMatchingEnabled: boolean } }>();
    expect(body.data.intentMatchingEnabled).toBe(true);
  });

  it("returns 403 when caller lacks automation_access", async () => {
    const restrictedApp = await buildApp({ role: "agent", permissions: {} });
    const res = await restrictedApp.inject({
      method: "PUT",
      url: "/v1/automation/settings/intent-matching",
      payload: { intentMatchingEnabled: true },
    });
    expect(res.statusCode).toBe(403);
    await restrictedApp.close();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @WBMSG/api test automation-settings
```

Expected: all tests pass including the 3 new ones.

- [ ] **Step 6: Run lint**

```bash
pnpm --filter @WBMSG/api lint
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/automation-settings.ts apps/api/src/routes/automation-settings.test.ts
git commit -m "feat(api): add GET+PUT /automation/settings/intent-matching routes"
```

---

## Task 5: Worker Integration

**Files:**
- Modify: `apps/api/src/workers/inbound-message.worker.ts`

**Interfaces:**
- Consumes: `runIntentMatching(prisma, organizationId, messageBody, conversationId, contactPhone, org): Promise<void>` from `../lib/intent-matcher.js`

- [ ] **Step 1: Add import at top of worker**

Open `apps/api/src/workers/inbound-message.worker.ts`. After the existing import block (after line 18), add:

```ts
import { runIntentMatching } from "../lib/intent-matcher.js";
```

- [ ] **Step 2: Add AI intent fallback after keyword match block**

Find the auto-reply evaluation section. Currently it ends around line 361 with the closing `}` of `if (matched) { ... }`. The outer `if (body && refreshed?.status !== "bot")` closes just after.

After the `if (matched) { ... }` block, but still inside `if (body && refreshed?.status !== "bot")`, add:

```ts
      // AI intent matching — fallback when no keyword matches
      if (!matched && org?.phoneNumberId && org?.wabaAccessToken) {
        void runIntentMatching(
          prisma,
          organizationId,
          body,
          conversation.id,
          whatsappContactPhone,
          { phoneNumberId: org.phoneNumberId, wabaAccessToken: org.wabaAccessToken }
        ).catch(() => {});
      }
```

The section should now read:

```ts
    let autoRepliedWithFlow = false;
    if (body && refreshed?.status !== "bot") {
      const autoReplies = await prisma.autoReply.findMany({
        where: { organizationId, isActive: true },
        orderBy: { priorityIndex: "asc" },
      });
      const matched = autoReplies.find((ar) => matchesAutoReply(ar.triggerType, ar.triggerKeyword, body));
      if (matched) {
        // ... existing send + flow logic (unchanged)
      }

      // AI intent matching — fallback when no keyword matches
      if (!matched && org?.phoneNumberId && org?.wabaAccessToken) {
        void runIntentMatching(
          prisma,
          organizationId,
          body,
          conversation.id,
          whatsappContactPhone,
          { phoneNumberId: org.phoneNumberId, wabaAccessToken: org.wabaAccessToken }
        ).catch(() => {});
      }
    }
```

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: exits 0.

- [ ] **Step 4: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/inbound-message.worker.ts
git commit -m "feat(worker): wire AI intent matching into inbound message pipeline"
```

---

## Task 6: Web UI — Page + Sidebar Nav

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx`
- Create: `apps/web/app/(dashboard)/flows/ai-intent-matching/page.tsx`

**Interfaces:**
- Consumes: `GET /v1/automation/settings/intent-matching`, `PUT /v1/automation/settings/intent-matching`
- Produces: Page at `/flows/ai-intent-matching`

- [ ] **Step 1: Add nav item to Sidebar**

Open `apps/web/components/layout/Sidebar.tsx`. Find the Flows children array (currently 3 items). Add "AI Intent Matching" as the second entry:

```ts
  {
    label: "Flows",
    icon: "⚡",
    perm: "automation_access",
    children: [
      { href: "/flows/basic-automation",   label: "Basic Automation",   perm: "automation_access" },
      { href: "/flows/ai-intent-matching", label: "AI Intent Matching", perm: "automation_access" },
      { href: "/flows",                    label: "Automation Flows",   perm: "automation_access", exact: true },
      { href: "/flows/auto-replies",       label: "Auto-Replies",       perm: "automation_access" },
    ],
  },
```

- [ ] **Step 2: Create the page file**

Create `apps/web/app/(dashboard)/flows/ai-intent-matching/page.tsx`:

```tsx
"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface IntentMatchSettings {
  intentMatchingEnabled: boolean;
  intentMatchCostPaise: number;
}

function PricingModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">AI Intent Match Pricing</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          You are charged only when AI successfully matches intent — not for every query.
        </p>
        <p className="text-sm font-semibold text-gray-800 mb-2">How it works:</p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-5 list-disc pl-5">
          <li>AI analyzes all incoming queries for free</li>
          <li>You are charged only when a query matches your workflow or triggers an auto-reply</li>
          <li>No charge for unmatched queries</li>
          <li>Charges are automatically deducted from your wallet</li>
        </ul>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-gray-700">
          <p className="font-semibold mb-1">Example:</p>
          <p>
            If you receive <strong>100 queries</strong> and <strong>10 queries</strong> match
            your workflow or auto-reply
          </p>
          <p className="mt-1">Cost calculation:</p>
          <p className="font-semibold mt-0.5">10 matches × ₹0 = ₹0 total</p>
          <p className="text-xs text-gray-500 mt-1">
            *You are NOT charged for the other 90 queries.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiIntentMatchingPage(): JSX.Element {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<IntentMatchSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const t = await getToken();
        const res = await fetch(`${API_URL}/v1/automation/settings/intent-matching`, {
          headers: { Authorization: `Bearer ${t ?? ""}` },
        });
        if (res.ok) {
          const body = await res.json() as { data: IntentMatchSettings };
          setSettings(body.data);
        }
      } catch { /* leave null */ }
    }
    void load();
  }, [getToken]);

  async function handleToggle(): Promise<void> {
    if (!settings || saving) return;
    setSaving(true);
    const next = !settings.intentMatchingEnabled;
    try {
      const t = await getToken();
      const res = await fetch(`${API_URL}/v1/automation/settings/intent-matching`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ intentMatchingEnabled: next }),
      });
      if (res.ok) {
        const body = await res.json() as { data: IntentMatchSettings };
        setSettings(body.data);
      }
    } catch { /* leave state unchanged */ } finally {
      setSaving(false);
    }
  }

  const enabled = settings?.intentMatchingEnabled ?? false;
  const costPaise = settings?.intentMatchCostPaise ?? 0;
  const costDisplay = costPaise === 0 ? "Free" : `₹${(costPaise / 100).toFixed(2)}`;

  return (
    <PermissionGate permission="automation_access">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg">
              ✦
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">AI Intent Matching</h1>
              <p className="text-sm text-gray-500">Get AI to select your reply to customers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={saving || settings === null}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              enabled
                ? "bg-green-500 text-white border-green-500 hover:bg-green-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {saving ? "Saving…" : enabled ? "AI Intent Match On" : "Enable AI Intent Match"}
          </button>
        </div>

        {/* Explainer card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-700 mb-6 leading-relaxed">
            AI Intent Matching understands what your customers are asking and automatically triggers
            the correct auto-reply or chatbot workflow that you&apos;ve already set up. Your existing
            flows stay exactly the same — they just become smarter.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual mockup */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200 max-w-xs">
                <p className="text-xs text-gray-400 mb-1">Customer Message · Received</p>
                <p className="text-sm text-gray-800">
                  I&apos;m unable to track my order. Where is it....when can I expect it to be delivered?
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-200 max-w-xs ml-auto text-right">
                <p className="text-xs text-blue-500 mb-1">✦ AI Analysing Intent…</p>
                <p className="text-xs text-gray-500">Keywords detected: Order · Tracking</p>
                <p className="text-xs text-gray-500">Scanning Automations…</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-200 max-w-xs ml-auto">
                <p className="text-xs text-green-600 font-medium mb-1">✓ Order Tracking Workflow Triggered</p>
                <p className="text-sm text-gray-800">I can help you track your order! Please provide your order number…</p>
              </div>
            </div>

            {/* Feature points */}
            <div className="space-y-4">
              {[
                {
                  title: "Understands messages",
                  desc: "AI understands customer messages even when keywords don't match.",
                },
                {
                  title: "Triggers the right automation",
                  desc: "Ensures the correct auto-reply or chatbot flow fires.",
                },
                {
                  title: "Zero setup required",
                  desc: "Works instantly with everything you already built.",
                },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">
                    ✓
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                    <p className="text-sm text-gray-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-gray-700">
          <span className="text-yellow-500 text-base">ⓘ</span>
          <span>
            <strong>{costDisplay} per successful intent match</strong> will be deducted from your wallet.{" "}
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className="text-brand-600 underline hover:no-underline"
            >
              How pricing works?
            </button>
          </span>
        </div>

        {/* Things to know */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <p className="text-sm font-semibold text-blue-800 mb-3">💡 Things to know.</p>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            <li>
              Before enabling AI Intent Matching, make sure you have created sufficient auto-replies &amp; workflows.
            </li>
            <li>
              AI Intent Matching works by intelligently routing customer messages to your existing automations.
              The agent will be useful only if there are a good number of auto-replies &amp; workflows covering
              different topics customers might reach out for.
            </li>
          </ul>
          <div className="flex gap-4 mt-4">
            <Link
              href="/flows/auto-replies"
              className="text-sm text-brand-600 font-medium hover:underline"
            >
              Set up Auto-Replies →
            </Link>
            <Link
              href="/flows"
              className="text-sm text-brand-600 font-medium hover:underline"
            >
              Create Workflows →
            </Link>
          </div>
        </div>
      </div>

      {showPricingModal && <PricingModal onClose={() => setShowPricingModal(false)} />}
    </PermissionGate>
  );
}
```

- [ ] **Step 3: Run type-check on web**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/layout/Sidebar.tsx apps/web/app/(dashboard)/flows/ai-intent-matching/page.tsx
git commit -m "feat(web): add AI Intent Matching page and sidebar nav item"
```

---

## Self-Review Notes

**Spec coverage check:**
- §2 Data model → Task 1 ✓
- §3 AI matching function → Task 2 ✓
- §4 Intent matcher module → Task 3 ✓
- §5 Worker integration → Task 5 ✓
- §6 API routes GET + PUT → Task 4 ✓
- §7 Web UI (page + modal + nav) → Task 6 ✓
- §8 Error handling (swallow failures, non-blocking) → covered in Task 3 (`interpolate` null guard), Task 5 (`.catch(() => {})`), Task 3 tests (early-return cases) ✓

**Placeholder scan:** No TBD, no TODO, no "similar to Task N" references — all tasks contain full code.

**Type consistency:**
- `IntentCandidate` and `IntentMatchResult` defined in Task 2, imported correctly in Task 3.
- `runIntentMatching` signature defined in Task 3, used identically in Task 5.
- Route response shape `{ data: { intentMatchingEnabled, intentMatchCostPaise } }` defined in Task 4 and consumed in Task 6.
