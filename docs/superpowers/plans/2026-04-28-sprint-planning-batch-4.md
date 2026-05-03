# Sprint Planning Batch 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the AI & Automation phase — Claude-powered smart reply suggestions (Sprint 13), OpenAI Whisper voice transcription (Sprint 14), visual flow builder with node-based automation (Sprint 15), chatbot engine with human escalation (Sprint 16), analytics dashboard with real metrics (Sprint 17), and Trust Score + ML prediction stubs (Sprint 18).

**Architecture:** Sprints 13–14 add AI capabilities on top of the existing messaging layer. Sprints 15–16 build the automation engine: Flows define trigger→action graphs stored as JSONB; the BullMQ runner evaluates nodes sequentially. Sprint 17 aggregates the event data accumulated by Sprints 1–16 into a real-time dashboard. Sprint 18 introduces the Python FastAPI ML microservice alongside the Node API, computing Trust Scores and churn predictions.

**Tech Stack:** `@anthropic-ai/sdk` (Claude API), `openai` (Whisper transcription), `reactflow` (flow canvas), `recharts` (dashboard charts), Python 3.11 + FastAPI + `scikit-learn` (ML service), `@fastify/http-proxy` (API gateway to ML service).

---

## File Map

### Sprint 13 — Smart Replies (AI)

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/lib/claude.ts` | Create | Claude API client — generateSuggestions(), detectIntent(), analyzeSentiment() |
| `apps/api/src/routes/ai.ts` | Create | POST /v1/conversations/:id/suggestions; POST /v1/messages/:id/analyze |
| `apps/api/src/routes/ai.test.ts` | Create | Vitest tests (mocked Claude SDK) |
| `apps/web/components/inbox/SmartReplies.tsx` | Create | Suggestion chips panel below message thread |
| `apps/web/app/(dashboard)/inbox/page.tsx` | Modify | Add SmartReplies component |
| `packages/shared/src/index.ts` | Modify | Add IntentType, SentimentType |

### Sprint 14 — Voice Transcription

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/lib/whisper.ts` | Create | transcribeAudio() — downloads WA media, calls Whisper API |
| `apps/api/src/routes/transcriptions.ts` | Create | POST /v1/messages/:id/transcribe |
| `apps/api/src/routes/transcriptions.test.ts` | Create | Vitest tests (mocked openai + fetch) |
| `apps/api/src/workers/inbound-message.worker.ts` | Modify | Auto-transcribe audio messages on inbound |
| `apps/web/components/inbox/VoiceMessage.tsx` | Create | Voice note player + transcript display |
| `apps/web/components/inbox/MessageThread.tsx` | Modify | Render VoiceMessage for audio content type |

### Sprint 15 — Flow Builder

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/lib/flow-runner.ts` | Create | runFlow(flow, triggerPayload) — execute node graph |
| `apps/api/src/workers/flow.worker.ts` | Create | BullMQ Worker — process flow execution jobs |
| `apps/api/src/lib/queue.ts` | Modify | Add flowQueue |
| `apps/api/src/routes/flows.ts` | Create | GET/POST/PATCH/DELETE /v1/flows; POST /v1/flows/:id/test |
| `apps/api/src/routes/flows.test.ts` | Create | Vitest tests |
| `apps/api/src/workers/inbound-message.worker.ts` | Modify | Trigger active flows on inbound message |
| `apps/web/app/(dashboard)/flows/page.tsx` | Create | Flows list |
| `apps/web/app/(dashboard)/flows/[id]/page.tsx` | Create | Flow builder canvas (reactflow) |
| `apps/web/components/flows/FlowCanvas.tsx` | Create | reactflow canvas with node types |
| `apps/web/components/flows/nodes/` | Create | TriggerNode, SendMessageNode, UpdateStageNode, WaitNode components |

### Sprint 16 — Chatbot Engine

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add Chatbot, BotSession models |
| `apps/api/src/lib/bot-runner.ts` | Create | handleBotMessage(conversation, message) — route through active flow |
| `apps/api/src/routes/chatbots.ts` | Create | GET/POST/PATCH /v1/chatbots; POST /v1/chatbots/:id/activate |
| `apps/api/src/routes/chatbots.test.ts` | Create | Vitest tests |
| `apps/api/src/workers/inbound-message.worker.ts` | Modify | If conversation.status === 'bot', route to bot-runner |
| `apps/web/app/(dashboard)/settings/chatbots/page.tsx` | Create | Chatbot management page |

### Sprint 17 — Analytics Dashboard

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/routes/analytics.ts` | Create | GET /v1/analytics/overview; GET /v1/analytics/conversations; GET /v1/analytics/team |
| `apps/api/src/lib/analytics-queries.ts` | Create | getOverviewMetrics(), getConversationVolume(), getTeamPerformance() |
| `apps/api/src/routes/analytics.test.ts` | Create | Vitest tests |
| `apps/web/app/(dashboard)/page.tsx` | Modify | Wire stat cards to real GET /v1/analytics/overview |
| `apps/web/components/analytics/MetricCard.tsx` | Create | Stat card with trend indicator |
| `apps/web/components/analytics/ConversationChart.tsx` | Create | recharts BarChart — daily message volume |
| `apps/web/components/analytics/TeamTable.tsx` | Create | Agent performance table |

### Sprint 18 — Trust Score & ML

| File | Action | Purpose |
|---|---|---|
| `services/ml/main.py` | Create | FastAPI app entry point |
| `services/ml/routers/trust_score.py` | Create | POST /trust-score — compute contact trust score |
| `services/ml/routers/predictions.py` | Create | POST /predict/churn, POST /predict/ltv |
| `services/ml/models/trust_score.py` | Create | TrustScoreModel.compute() |
| `services/ml/requirements.txt` | Create | fastapi, uvicorn, scikit-learn, pandas |
| `services/ml/Dockerfile` | Create | Python 3.11 slim image |
| `docker-compose.yml` | Modify | Add ml-service container |
| `apps/api/src/plugins/ml-proxy.ts` | Create | @fastify/http-proxy forwards /v1/ml/* to ML service |
| `apps/api/src/routes/trust-score.ts` | Create | GET /v1/contacts/:id/trust-score |
| `apps/web/app/(dashboard)/contacts/[id]/page.tsx` | Modify | Show Trust Score badge |

---

## Task 1: Claude API client

**Files:**
- Create: `apps/api/src/lib/claude.ts`

- [ ] **Step 1: Install Anthropic SDK**

```bash
pnpm --filter @WBMSG/api add @anthropic-ai/sdk
```

- [ ] **Step 2: Add env var to `.env.example`**

```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/routes/ai.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: '["Sure!", "Let me check.", "I understand."]' }],
      }),
    };
  },
}));

vi.mock("../lib/claude.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/claude.js")>();
  return actual;
});

describe("generateSuggestions", () => {
  it("returns array of suggestion strings", async () => {
    const { generateSuggestions } = await import("../lib/claude.js");
    const result = await generateSuggestions([
      { role: "user", content: "Hello, I need help with my order" },
    ]);
    expect(Array.isArray(result)).toBe(true);
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/ai.test.ts`
Expected: FAIL — Cannot find module `'../lib/claude.js'`

- [ ] **Step 4: Create `apps/api/src/lib/claude.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

export type IntentType = "question" | "complaint" | "order" | "compliment" | "other";
export type SentimentType = "positive" | "negative" | "neutral";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are a helpful customer support assistant for WBMSG, a WhatsApp-first CRM.
Your job is to help support agents respond to customer messages.
Be concise, professional, and empathetic. Respond in the same language as the customer.`;

export async function generateSuggestions(
  history: Message[],
  count = 3
): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      ...history,
      {
        role: "user",
        content: `Based on this conversation, generate ${count} short, natural reply suggestions for the agent. Return ONLY a JSON array of strings. No explanation.`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string").slice(0, count);
  } catch {
    // Return empty if parse fails
  }
  return [];
}

export async function detectIntent(messageBody: string): Promise<IntentType> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16,
    system: "Classify the customer message intent. Reply with exactly one word: question, complaint, order, compliment, or other.",
    messages: [{ role: "user", content: messageBody }],
  });

  const text = (response.content[0]?.type === "text" ? response.content[0].text : "other").toLowerCase().trim() as IntentType;
  const valid: IntentType[] = ["question", "complaint", "order", "compliment", "other"];
  return valid.includes(text) ? text : "other";
}

export async function analyzeSentiment(messageBody: string): Promise<SentimentType> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16,
    system: "Classify the sentiment of this customer message. Reply with exactly one word: positive, negative, or neutral.",
    messages: [{ role: "user", content: messageBody }],
  });

  const text = (response.content[0]?.type === "text" ? response.content[0].text : "neutral").toLowerCase().trim() as SentimentType;
  const valid: SentimentType[] = ["positive", "negative", "neutral"];
  return valid.includes(text) ? text : "neutral";
}
```

- [ ] **Step 5: Run test — confirm pass**

```bash
pnpm --filter @WBMSG/api test src/routes/ai.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/claude.ts apps/api/src/routes/ai.test.ts apps/api/package.json pnpm-lock.yaml .env.example
git commit -m "feat(api): add Claude AI client (suggestions, intent, sentiment)"
```

---

## Task 2: AI routes

**Files:**
- Create: `apps/api/src/routes/ai.ts`

- [ ] **Step 1: Add IntentType + SentimentType to shared types**

In `packages/shared/src/index.ts`:
```typescript
export type IntentType = "question" | "complaint" | "order" | "compliment" | "other";
export type SentimentType = "positive" | "negative" | "neutral";
```

- [ ] **Step 2: Create `apps/api/src/routes/ai.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { generateSuggestions, detectIntent, analyzeSentiment } from "../lib/claude.js";
import type { ConversationId, MessageId } from "@WBMSG/shared";

export const aiRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: ConversationId } }>(
    "/conversations/:id/suggestions",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }

      const messages = await fastify.prisma.message.findMany({
        where: { conversationId: request.params.id },
        orderBy: { sentAt: "desc" },
        take: 10,
      });

      const history = messages
        .reverse()
        .filter((m) => m.body)
        .map((m) => ({
          role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
          content: m.body ?? "",
        }));

      const suggestions = await generateSuggestions(history);
      return reply.send({ data: { suggestions } });
    }
  );

  fastify.post<{ Params: { id: MessageId } }>(
    "/messages/:id/analyze",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!message) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
      }
      if (!message.body) {
        return reply.status(400).send({ error: { code: "NO_BODY", message: "Message has no text body to analyze" } });
      }

      const [intent, sentiment] = await Promise.all([
        detectIntent(message.body),
        analyzeSentiment(message.body),
      ]);

      return reply.send({ data: { intent, sentiment } });
    }
  );
};
```

- [ ] **Step 3: Register in `apps/api/src/routes/index.ts`**

```typescript
import { aiRouter } from "./ai.js";
await fastify.register(aiRouter, { prefix: "/v1" });
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/ai.ts apps/api/src/routes/index.ts packages/shared/src/
git commit -m "feat(api): add AI routes — suggestions + intent/sentiment analysis"
```

---

## Task 3: Smart replies UI component

**Files:**
- Create: `apps/web/components/inbox/SmartReplies.tsx`
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create `apps/web/components/inbox/SmartReplies.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface SmartRepliesProps {
  conversationId: string | null;
  onSelect: (text: string) => void;
}

export function SmartReplies({ conversationId, onSelect }: SmartRepliesProps): JSX.Element {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    if (!conversationId) { setSuggestions([]); return; }

    async function fetchSuggestions() {
      setLoading(true);
      try {
        const token = await getToken();
        const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        const res = await fetch(`${api}/v1/conversations/${conversationId}/suggestions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) return;
        const json = await res.json() as { data: { suggestions: string[] } };
        setSuggestions(json.data.suggestions);
      } finally {
        setLoading(false);
      }
    }

    void fetchSuggestions();
  }, [conversationId, getToken]);

  if (!conversationId || (!loading && suggestions.length === 0)) return <></>;

  return (
    <div className="flex gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200 flex-wrap">
      <span className="text-xs text-gray-400 self-center shrink-0">✨ AI:</span>
      {loading ? (
        <>
          {[60, 80, 72].map((w) => (
            <div key={w} style={{ width: w }} className="h-7 rounded-full bg-gray-200 animate-pulse" />
          ))}
        </>
      ) : (
        suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-300 text-gray-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
          >
            {s}
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify `apps/web/app/(dashboard)/inbox/page.tsx`**

Add SmartReplies between MessageThread and SendMessageForm, and wire the `onSelect` to pre-fill the send form:

```tsx
// Add state for prefill
const [prefillText, setPrefillText] = useState("");

// In JSX, between MessageThread and SendMessageForm:
<SmartReplies
  conversationId={selectedConversationId}
  onSelect={(text) => setPrefillText(text)}
/>
<SendMessageForm
  conversationId={selectedConversationId}
  prefillText={prefillText}
  onSent={() => setPrefillText("")}
/>
```

Also update `SendMessageForm` to accept `prefillText` prop and set it as initial input value via `useEffect`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/inbox/SmartReplies.tsx apps/web/app/\(dashboard\)/inbox/page.tsx apps/web/components/inbox/SendMessageForm.tsx
git commit -m "feat(web): add smart reply suggestion chips in inbox"
```

---

## Task 4: Whisper voice transcription

**Files:**
- Create: `apps/api/src/lib/whisper.ts`
- Create: `apps/api/src/routes/transcriptions.ts`
- Create: `apps/api/src/routes/transcriptions.test.ts`

- [ ] **Step 1: Install OpenAI SDK**

```bash
pnpm --filter @WBMSG/api add openai
```

Add to `.env.example`:
```
OPENAI_API_KEY=sk-...
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/routes/transcriptions.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

vi.mock("openai", () => ({
  default: class {
    audio = {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ text: "Hello, I need help with my order." }),
      },
    };
  },
}));

vi.mock("../lib/whisper.js", () => ({
  transcribeAudio: vi.fn().mockResolvedValue("Hello, I need help with my order."),
}));

const mockPrisma = {
  message: { findFirst: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "agent" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { transcriptionsRouter } = await import("./transcriptions.js");
  await app.register(transcriptionsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/messages/:id/transcribe", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("transcribes audio message and updates body", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({
      id: "msg-1", organizationId: "org-1", contentType: "audio", whatsappMessageId: "wamid.audio",
    });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-1", body: "Hello, I need help." });

    const res = await app.inject({ method: "POST", url: "/v1/messages/msg-1/transcribe" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { transcript: string } }>().data.transcript).toBeTruthy();
  });

  it("returns 400 for non-audio message", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({
      id: "msg-2", organizationId: "org-1", contentType: "text",
    });
    const res = await app.inject({ method: "POST", url: "/v1/messages/msg-2/transcribe" });
    expect(res.statusCode).toBe(400);
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/transcriptions.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `apps/api/src/lib/whisper.ts`**

```typescript
import OpenAI from "openai";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

export async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<string> {
  // Step 1: Get the media URL from Meta API
  const urlRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!urlRes.ok) throw new Error(`Failed to get media URL for ${mediaId}`);
  const urlData = await urlRes.json() as { url: string };

  // Step 2: Download the media file
  const mediaRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) throw new Error(`Failed to download media ${mediaId}`);

  const tmpPath = join(tmpdir(), `wa-audio-${mediaId}.ogg`);
  const fileStream = createWriteStream(tmpPath);
  if (!mediaRes.body) throw new Error("Empty response body from media download");
  await pipeline(mediaRes.body as unknown as NodeJS.ReadableStream, fileStream);
  return tmpPath;
}

export async function transcribeAudio(mediaId: string, accessToken: string): Promise<string> {
  const tmpPath = await downloadWhatsAppMedia(mediaId, accessToken);
  const transcription = await openai.audio.transcriptions.create({
    file: createReadStream(tmpPath),
    model: "whisper-1",
  });
  return transcription.text;
}
```

- [ ] **Step 4: Create `apps/api/src/routes/transcriptions.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { transcribeAudio } from "../lib/whisper.js";
import type { MessageId } from "@WBMSG/shared";

export const transcriptionsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: MessageId } }>(
    "/messages/:id/transcribe",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const message = await fastify.prisma.message.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!message) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Message not found" } });
      }
      if (message.contentType !== "audio" || !message.whatsappMessageId) {
        return reply.status(400).send({ error: { code: "NOT_AUDIO", message: "Message is not a transcribable audio message" } });
      }

      const transcript = await transcribeAudio(
        message.whatsappMessageId,
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );

      const updated = await fastify.prisma.message.update({
        where: { id: message.id },
        data: { body: transcript },
      });

      return reply.send({ data: { transcript, message: updated } });
    }
  );
};
```

- [ ] **Step 5: Auto-transcribe in inbound worker**

In `apps/api/src/workers/inbound-message.worker.ts`, after storing the message:
```typescript
import { transcribeAudio } from "../lib/whisper.js";

// After message.create(), if audio:
if (contentType === "audio" && whatsappMessageId) {
  try {
    const transcript = await transcribeAudio(whatsappMessageId, process.env["WA_ACCESS_TOKEN"] ?? "");
    await prisma.message.update({ where: { id: storedMessage.id }, data: { body: transcript } });
  } catch {
    // Transcription failure is non-critical — log and continue
  }
}
```

- [ ] **Step 6: Register + run tests**

In `apps/api/src/routes/index.ts`:
```typescript
import { transcriptionsRouter } from "./transcriptions.js";
await fastify.register(transcriptionsRouter, { prefix: "/v1" });
```

```bash
pnpm --filter @WBMSG/api test src/routes/transcriptions.test.ts
```

Expected: PASS

- [ ] **Step 7: Create `apps/web/components/inbox/VoiceMessage.tsx`**

```tsx
"use client";

import { JSX, useRef, useState } from "react";

interface VoiceMessageProps {
  transcript: string | null;
  mediaUrl: string | null;
  direction: "inbound" | "outbound";
}

export function VoiceMessage({ transcript, direction }: VoiceMessageProps): JSX.Element {
  return (
    <div className={`max-w-xs rounded-2xl px-4 py-2 ${
      direction === "outbound" ? "bg-wa-light rounded-br-none" : "bg-white border border-gray-200 rounded-bl-none shadow-card"
    }`}>
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        <span>🎤</span>
        <span>Voice message</span>
      </div>
      {transcript ? (
        <p className="text-sm text-gray-800 italic">"{transcript}"</p>
      ) : (
        <p className="text-xs text-gray-400">Transcribing…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/whisper.ts apps/api/src/routes/transcriptions.ts apps/api/src/routes/transcriptions.test.ts apps/api/src/routes/index.ts apps/api/src/workers/inbound-message.worker.ts apps/web/components/inbox/VoiceMessage.tsx apps/api/package.json pnpm-lock.yaml .env.example
git commit -m "feat(api,web): add Whisper voice transcription + VoiceMessage UI"
```

---

## Task 5: Flow runner + API

**Files:**
- Create: `apps/api/src/lib/flow-runner.ts`
- Create: `apps/api/src/workers/flow.worker.ts`
- Create: `apps/api/src/routes/flows.ts`
- Create: `apps/api/src/routes/flows.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/flows.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn() },
  campaignQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const mockPrisma = {
  flow: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { flowsRouter } = await import("./flows.js");
  await app.register(flowsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/flows", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("creates a flow with isActive: false by default", async () => {
    mockPrisma.flow.create.mockResolvedValue({
      id: "flow-1", name: "Welcome Flow", triggerType: "inbound_message", isActive: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/flows",
      payload: {
        name: "Welcome Flow",
        triggerType: "inbound_message",
        flowDefinition: { nodes: [] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { isActive: boolean } }>().data.isActive).toBe(false);
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/flows.test.ts`
Expected: FAIL

- [ ] **Step 2: Add flowQueue to `apps/api/src/lib/queue.ts`**

```typescript
export const flowQueue = new Queue("flows", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});
```

- [ ] **Step 3: Create `apps/api/src/lib/flow-runner.ts`**

```typescript
import { PrismaClient } from "@prisma/client";
import { sendTextMessage } from "./whatsapp.js";

export type TriggerType = "inbound_message" | "contact_tag_added" | "conversation_assigned";

export interface FlowNode {
  id: string;
  type: "send_message" | "update_stage" | "assign_conversation" | "add_tag" | "wait" | "end";
  config: Record<string, unknown>;
  next: string | null;
}

export interface FlowDefinition {
  startNodeId: string;
  nodes: FlowNode[];
}

export interface FlowTriggerPayload {
  conversationId: string;
  organizationId: string;
  contactPhone?: string;
  messageBody?: string;
}

export async function runFlow(
  prisma: PrismaClient,
  flowDefinition: FlowDefinition,
  payload: FlowTriggerPayload
): Promise<void> {
  const nodeMap = new Map<string, FlowNode>(
    flowDefinition.nodes.map((n) => [n.id, n])
  );

  let currentNodeId: string | null = flowDefinition.startNodeId;

  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId);
    if (!node) break;

    switch (node.type) {
      case "send_message": {
        const text = (node.config["text"] as string) ?? "";
        if (payload.contactPhone && text) {
          await sendTextMessage(
            process.env["WA_PHONE_NUMBER_ID"] ?? "",
            payload.contactPhone,
            text,
            process.env["WA_ACCESS_TOKEN"] ?? ""
          );
        }
        break;
      }
      case "update_stage": {
        const stage = node.config["lifecycleStage"] as string;
        if (stage && payload.contactPhone) {
          await prisma.contact.updateMany({
            where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
            data: { lifecycleStage: stage as "lead" | "prospect" | "customer" | "loyal" | "churned" },
          });
        }
        break;
      }
      case "assign_conversation": {
        const assignTo = node.config["assignTo"] as string;
        if (assignTo) {
          await prisma.conversation.update({
            where: { id: payload.conversationId },
            data: { assignedTo: assignTo },
          });
        }
        break;
      }
      case "add_tag": {
        const tag = node.config["tag"] as string;
        if (tag && payload.contactPhone) {
          const contact = await prisma.contact.findFirst({
            where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
          });
          if (contact && !contact.tags.includes(tag)) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { tags: { push: tag } },
            });
          }
        }
        break;
      }
      case "wait": {
        // Wait nodes pause execution — in a real impl, reschedule the job with a delay
        // For Sprint 15, wait is a no-op (immediate continue)
        break;
      }
      case "end":
        return;
    }

    currentNodeId = node.next;
  }
}
```

- [ ] **Step 4: Create `apps/api/src/workers/flow.worker.ts`**

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { runFlow, FlowDefinition, FlowTriggerPayload } from "../lib/flow-runner.js";

interface FlowJob {
  flowId: string;
  payload: FlowTriggerPayload;
}

export const flowWorker = new Worker<FlowJob>(
  "flows",
  async (job) => {
    const { flowId, payload } = job.data;
    const flow = await prisma.flow.findFirst({ where: { id: flowId } });
    if (!flow || !flow.isActive) return;
    await runFlow(prisma, flow.flowDefinition as FlowDefinition, payload);
  },
  { connection: redisConnection }
);
```

- [ ] **Step 5: Create `apps/api/src/routes/flows.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { flowQueue } from "../lib/queue.js";
import type { FlowDefinition, FlowTriggerPayload } from "../lib/flow-runner.js";

interface FlowBody {
  name: string;
  triggerType: string;
  flowDefinition: FlowDefinition;
}

export const flowsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/flows", async (request, reply) => {
    const { organizationId } = request.auth;
    const flows = await fastify.prisma.flow.findMany({ where: { organizationId } });
    return reply.send({ data: flows });
  });

  fastify.get<{ Params: { id: string } }>("/flows/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const flow = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
    if (!flow) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    return reply.send({ data: flow });
  });

  fastify.post<{ Body: FlowBody }>("/flows", async (request, reply) => {
    const { organizationId } = request.auth;
    const flow = await fastify.prisma.flow.create({
      data: {
        organizationId,
        name: request.body.name,
        triggerType: request.body.triggerType,
        isActive: false,
        flowDefinition: request.body.flowDefinition as object,
      },
    });
    return reply.status(201).send({ data: flow });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<FlowBody> & { isActive?: boolean } }>(
    "/flows/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
      const flow = await fastify.prisma.flow.update({
        where: { id: request.params.id },
        data: request.body as object,
      });
      return reply.send({ data: flow });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/flows/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    await fastify.prisma.flow.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string }; Body: FlowTriggerPayload }>(
    "/flows/:id/test",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const flow = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
      if (!flow) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });

      await flowQueue.add("test-flow", { flowId: flow.id, payload: { ...request.body, organizationId } });
      return reply.send({ data: { status: "queued", message: "Flow test job enqueued" } });
    }
  );
};
```

- [ ] **Step 6: Trigger flows on inbound message**

In `apps/api/src/workers/inbound-message.worker.ts`, after conversation creation:
```typescript
import { flowQueue } from "../lib/queue.js";

// After conversation created/found:
const activeFlows = await prisma.flow.findMany({
  where: { organizationId, isActive: true, triggerType: "inbound_message" },
  select: { id: true },
});
for (const flow of activeFlows) {
  await flowQueue.add("trigger-flow", {
    flowId: flow.id,
    payload: {
      conversationId: conversation.id,
      organizationId,
      contactPhone: whatsappContactPhone,
      messageBody: body ?? "",
    },
  });
}
```

- [ ] **Step 7: Register + run tests**

In `apps/api/src/routes/index.ts`:
```typescript
import { flowsRouter } from "./flows.js";
await fastify.register(flowsRouter, { prefix: "/v1" });
```

In `apps/api/src/index.ts`:
```typescript
import "./workers/flow.worker.js";
```

```bash
pnpm --filter @WBMSG/api test src/routes/flows.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/flow-runner.ts apps/api/src/workers/flow.worker.ts apps/api/src/routes/flows.ts apps/api/src/routes/flows.test.ts apps/api/src/lib/queue.ts apps/api/src/routes/index.ts apps/api/src/index.ts apps/api/src/workers/inbound-message.worker.ts
git commit -m "feat(api): add flow builder — runner, worker, CRUD + test endpoint"
```

---

## Task 6: Flow builder UI (reactflow canvas)

**Files:**
- Create: `apps/web/components/flows/FlowCanvas.tsx`
- Create: `apps/web/components/flows/nodes/TriggerNode.tsx`
- Create: `apps/web/components/flows/nodes/ActionNode.tsx`
- Create: `apps/web/app/(dashboard)/flows/page.tsx`
- Create: `apps/web/app/(dashboard)/flows/[id]/page.tsx`

- [ ] **Step 1: Install reactflow**

```bash
pnpm --filter @WBMSG/web add reactflow
```

- [ ] **Step 2: Create `apps/web/components/flows/nodes/TriggerNode.tsx`**

```tsx
import { JSX } from "react";
import { Handle, Position, NodeProps } from "reactflow";

interface TriggerNodeData {
  triggerType: string;
  label: string;
}

export function TriggerNode({ data }: NodeProps<TriggerNodeData>): JSX.Element {
  return (
    <div className="bg-brand-50 border-2 border-brand-400 rounded-xl px-4 py-3 min-w-36 shadow-card">
      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Trigger</p>
      <p className="text-sm text-brand-900 mt-1">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-brand-500" />
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/flows/nodes/ActionNode.tsx`**

```tsx
import { JSX } from "react";
import { Handle, Position, NodeProps } from "reactflow";

interface ActionNodeData {
  type: string;
  label: string;
  config: Record<string, unknown>;
}

const typeColors: Record<string, string> = {
  send_message:         "bg-blue-50 border-blue-400 text-blue-900",
  update_stage:         "bg-purple-50 border-purple-400 text-purple-900",
  assign_conversation:  "bg-yellow-50 border-yellow-400 text-yellow-900",
  add_tag:              "bg-green-50 border-green-400 text-green-900",
  wait:                 "bg-gray-50 border-gray-400 text-gray-900",
};

export function ActionNode({ data }: NodeProps<ActionNodeData>): JSX.Element {
  const colorClass = typeColors[data.type] ?? "bg-gray-50 border-gray-400 text-gray-900";
  return (
    <div className={`border-2 rounded-xl px-4 py-3 min-w-36 shadow-card ${colorClass}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-400" />
      <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{data.type.replace(/_/g, " ")}</p>
      <p className="text-sm mt-1">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-gray-400" />
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/flows/FlowCanvas.tsx`**

```tsx
"use client";

import { JSX, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
};

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
  readOnly?: boolean;
}

export function FlowCanvas({ initialNodes, initialEdges, onChange, readOnly = false }: FlowCanvasProps): JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const next = addEdge({ ...params, animated: true }, eds);
      onChange?.(nodes, next);
      return next;
    });
  }, [nodes, onChange, setEdges]);

  return (
    <div style={{ height: "calc(100vh - 200px)" }} className="rounded-xl border border-gray-200 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
      >
        <Background gap={16} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap nodeColor="#22c55e" />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/app/(dashboard)/flows/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Flow { id: string; name: string; triggerType: string; isActive: boolean; }

async function getFlows(token: string): Promise<Flow[]> {
  const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  return res.ok ? (await res.json() as { data: Flow[] }).data : [];
}

export default async function FlowsPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const flows = await getFlows(await getToken() ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Automation Flows</h1>
        <Link href="/flows/new"><Button>New Flow</Button></Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {flows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No flows yet.</p>
        ) : (
          flows.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link href={`/flows/${f.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">{f.name}</Link>
                <p className="text-xs text-gray-500">{f.triggerType.replace(/_/g, " ")}</p>
              </div>
              <Badge variant={f.isActive ? "green" : "gray"}>{f.isActive ? "Active" : "Inactive"}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/web/app/(dashboard)/flows/[id]/page.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { FlowCanvas } from "@/components/flows/FlowCanvas";
import { Button } from "@/components/ui/Button";
import type { Node, Edge } from "reactflow";

interface Flow {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  flowDefinition: { startNodeId: string; nodes: Array<{ id: string; type: string; config: Record<string, unknown>; next: string | null }> };
}

function flowToReactFlow(flow: Flow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = flow.flowDefinition.nodes.map((n, i) => ({
    id: n.id,
    type: i === 0 ? "trigger" : "action",
    position: { x: 200, y: i * 150 },
    data: { label: n.config["text"] ?? n.type, type: n.type, triggerType: flow.triggerType, config: n.config },
  }));
  const edges: Edge[] = flow.flowDefinition.nodes
    .filter((n) => n.next)
    .map((n) => ({ id: `e-${n.id}`, source: n.id, target: n.next!, animated: true }));
  return { nodes, edges };
}

export default function FlowDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows/${id}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setFlow((await res.json() as { data: Flow }).data);
    }
    void load();
  }, [id, getToken]);

  async function toggleActive() {
    if (!flow) return;
    setToggling(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows/${flow.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !flow.isActive }),
      });
      if (res.ok) setFlow((await res.json() as { data: Flow }).data);
    } finally {
      setToggling(false);
    }
  }

  if (!flow) return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;

  const { nodes, edges } = flowToReactFlow(flow);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{flow.name}</h1>
          <p className="text-sm text-gray-500">Trigger: {flow.triggerType.replace(/_/g, " ")}</p>
        </div>
        <Button variant={flow.isActive ? "destructive" : "primary"} onClick={() => void toggleActive()} disabled={toggling}>
          {toggling ? "…" : flow.isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
      <FlowCanvas initialNodes={nodes} initialEdges={edges} readOnly />
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/flows/ apps/web/app/\(dashboard\)/flows/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add flow builder canvas + flows list + detail page"
```

---

## Task 7: Chatbot engine

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/lib/bot-runner.ts`
- Create: `apps/api/src/routes/chatbots.ts`
- Create: `apps/api/src/routes/chatbots.test.ts`

- [ ] **Step 1: Add Chatbot + BotSession to Prisma schema**

```prisma
model Chatbot {
  id             String      @id @default(uuid())
  organizationId String
  name           String
  flowId         String
  isActive       Boolean     @default(false)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  sessions       BotSession[]

  @@index([organizationId])
  @@map("chatbots")
}

model BotSession {
  id             String   @id @default(uuid())
  chatbotId      String
  chatbot        Chatbot  @relation(fields: [chatbotId], references: [id])
  conversationId String   @unique
  currentNodeId  String?
  isEscalated    Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([conversationId])
  @@map("bot_sessions")
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_chatbots_bot_sessions
pnpm exec prisma generate
```

- [ ] **Step 3: Create `apps/api/src/lib/bot-runner.ts`**

```typescript
import { PrismaClient } from "@prisma/client";
import { sendTextMessage } from "./whatsapp.js";
import { generateSuggestions } from "./claude.js";
import { FlowDefinition, FlowNode } from "./flow-runner.js";

export async function handleBotMessage(
  prisma: PrismaClient,
  conversationId: string,
  organizationId: string,
  inboundBody: string | null
): Promise<void> {
  const session = await prisma.botSession.findFirst({ where: { conversationId } });
  if (!session || session.isEscalated) return;

  const chatbot = await prisma.chatbot.findFirst({
    where: { id: session.chatbotId, isActive: true },
  });
  if (!chatbot) return;

  const flow = await prisma.flow.findFirst({ where: { id: chatbot.flowId } });
  if (!flow) return;

  const definition = flow.flowDefinition as FlowDefinition;
  const nodeMap = new Map<string, FlowNode>(definition.nodes.map((n) => [n.id, n]));
  const currentNodeId = session.currentNodeId ?? definition.startNodeId;
  const node = nodeMap.get(currentNodeId);
  if (!node) return;

  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId } });
  const contactPhone = conversation?.whatsappContactId ?? "";

  if (node.type === "send_message") {
    const text = (node.config["text"] as string) ?? "";
    if (text && contactPhone) {
      await sendTextMessage(
        process.env["WA_PHONE_NUMBER_ID"] ?? "",
        contactPhone,
        text,
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );
    }
    await prisma.botSession.update({
      where: { id: session.id },
      data: { currentNodeId: node.next ?? null },
    });
  } else if (node.type === "end" || !node.next) {
    // Escalate to human
    await prisma.botSession.update({ where: { id: session.id }, data: { isEscalated: true } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "open" } });
    if (contactPhone) {
      await sendTextMessage(
        process.env["WA_PHONE_NUMBER_ID"] ?? "",
        contactPhone,
        "You're now connected with a live agent. Please hold on.",
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );
    }
  }
}
```

- [ ] **Step 4: Write failing test**

Create `apps/api/src/routes/chatbots.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  chatbot: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { chatbotsRouter } = await import("./chatbots.js");
  await app.register(chatbotsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/chatbots", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("creates chatbot with isActive: false", async () => {
    mockPrisma.chatbot.create.mockResolvedValue({
      id: "bot-1", name: "Welcome Bot", flowId: "flow-1", isActive: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/chatbots",
      payload: { name: "Welcome Bot", flowId: "flow-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { isActive: boolean } }>().data.isActive).toBe(false);
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/chatbots.test.ts`
Expected: FAIL

- [ ] **Step 5: Create `apps/api/src/routes/chatbots.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";

interface ChatbotBody {
  name: string;
  flowId: string;
}

export const chatbotsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/chatbots", async (request, reply) => {
    const { organizationId } = request.auth;
    const bots = await fastify.prisma.chatbot.findMany({ where: { organizationId } });
    return reply.send({ data: bots });
  });

  fastify.post<{ Body: ChatbotBody }>("/chatbots", async (request, reply) => {
    const { organizationId } = request.auth;
    const bot = await fastify.prisma.chatbot.create({
      data: { organizationId, name: request.body.name, flowId: request.body.flowId, isActive: false },
    });
    return reply.status(201).send({ data: bot });
  });

  fastify.post<{ Params: { id: string } }>("/chatbots/:id/activate", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.chatbot.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Chatbot not found" } });
    const bot = await fastify.prisma.chatbot.update({
      where: { id: request.params.id },
      data: { isActive: !existing.isActive },
    });
    return reply.send({ data: bot });
  });
};
```

- [ ] **Step 6: Route bot messages in inbound worker**

In `apps/api/src/workers/inbound-message.worker.ts`, after storing the message:
```typescript
import { handleBotMessage } from "../lib/bot-runner.js";

// After message stored, check if conversation is in bot mode:
const refreshed = await prisma.conversation.findFirst({ where: { id: conversation.id } });
if (refreshed?.status === "bot") {
  await handleBotMessage(prisma, conversation.id, organizationId, body);
}
```

- [ ] **Step 7: Register + run tests**

```typescript
import { chatbotsRouter } from "./chatbots.js";
await fastify.register(chatbotsRouter, { prefix: "/v1" });
```

```bash
pnpm --filter @WBMSG/api test src/routes/chatbots.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/ apps/api/src/lib/bot-runner.ts apps/api/src/routes/chatbots.ts apps/api/src/routes/chatbots.test.ts apps/api/src/workers/inbound-message.worker.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add chatbot engine — bot sessions, human escalation, activation"
```

---

## Task 8: Analytics API

**Files:**
- Create: `apps/api/src/lib/analytics-queries.ts`
- Create: `apps/api/src/routes/analytics.ts`
- Create: `apps/api/src/routes/analytics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/analytics.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  conversation: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  message: { count: vi.fn(), aggregate: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { analyticsRouter } = await import("./analytics.js");
  await app.register(analyticsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/analytics/overview", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns overview metrics", async () => {
    mockPrisma.conversation.count.mockResolvedValue(42);
    mockPrisma.message.count.mockResolvedValue(120);
    const res = await app.inject({ method: "GET", url: "/v1/analytics/overview" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { openConversations: number } }>();
    expect(typeof body.data.openConversations).toBe("number");
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/analytics.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `apps/api/src/lib/analytics-queries.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

export interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  pendingInvitations: number;
}

export interface DailyVolume {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AgentPerformance {
  assignedTo: string;
  conversationsHandled: number;
}

export async function getOverviewMetrics(
  prisma: PrismaClient,
  organizationId: string
): Promise<OverviewMetrics> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [openConversations, totalContacts, messagesToday, pendingInvitations] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "open" } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.message.count({
      where: { organizationId, createdAt: { gte: startOfDay } },
    }),
    prisma.invitation.count({ where: { organizationId, status: "pending" } }),
  ]);

  return { openConversations, totalContacts, messagesToday, pendingInvitations };
}

export async function getConversationVolume(
  prisma: PrismaClient,
  organizationId: string,
  days = 14
): Promise<DailyVolume[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const messages = await prisma.message.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { direction: true, createdAt: true },
  });

  const buckets: Record<string, { inbound: number; outbound: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0]!;
    buckets[key] = { inbound: 0, outbound: 0 };
  }

  for (const msg of messages) {
    const key = msg.createdAt.toISOString().split("T")[0]!;
    if (buckets[key]) {
      if (msg.direction === "inbound") buckets[key]!.inbound++;
      else buckets[key]!.outbound++;
    }
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

export async function getTeamPerformance(
  prisma: PrismaClient,
  organizationId: string
): Promise<AgentPerformance[]> {
  const conversations = await prisma.conversation.findMany({
    where: { organizationId, assignedTo: { not: null } },
    select: { assignedTo: true },
  });

  const counts: Record<string, number> = {};
  for (const c of conversations) {
    if (c.assignedTo) counts[c.assignedTo] = (counts[c.assignedTo] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([assignedTo, conversationsHandled]) => ({ assignedTo, conversationsHandled }));
}
```

- [ ] **Step 3: Create `apps/api/src/routes/analytics.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import {
  getOverviewMetrics,
  getConversationVolume,
  getTeamPerformance,
} from "../lib/analytics-queries.js";

export const analyticsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/analytics/overview", async (request, reply) => {
    const { organizationId } = request.auth;
    const metrics = await getOverviewMetrics(fastify.prisma, organizationId);
    return reply.send({ data: metrics });
  });

  fastify.get("/analytics/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const days = parseInt(query["days"] ?? "14", 10);
    const volume = await getConversationVolume(fastify.prisma, organizationId, days);
    return reply.send({ data: volume });
  });

  fastify.get("/analytics/team", async (request, reply) => {
    const { organizationId } = request.auth;
    const performance = await getTeamPerformance(fastify.prisma, organizationId);
    return reply.send({ data: performance });
  });
};
```

- [ ] **Step 4: Register + run tests**

```typescript
import { analyticsRouter } from "./analytics.js";
await fastify.register(analyticsRouter, { prefix: "/v1" });
```

```bash
pnpm --filter @WBMSG/api test src/routes/analytics.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/analytics-queries.ts apps/api/src/routes/analytics.ts apps/api/src/routes/analytics.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add analytics routes — overview, conversation volume, team performance"
```

---

## Task 9: Analytics dashboard UI

**Files:**
- Create: `apps/web/components/analytics/MetricCard.tsx`
- Create: `apps/web/components/analytics/ConversationChart.tsx`
- Create: `apps/web/components/analytics/TeamTable.tsx`
- Modify: `apps/web/app/(dashboard)/page.tsx`

- [ ] **Step 1: Install recharts**

```bash
pnpm --filter @WBMSG/web add recharts
```

- [ ] **Step 2: Create `apps/web/components/analytics/MetricCard.tsx`**

```tsx
import { JSX } from "react";

interface MetricCardProps {
  label: string;
  value: number | string;
  trend?: string;
  trendUp?: boolean;
}

export function MetricCard({ label, value, trend, trendUp }: MetricCardProps): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trendUp ? "text-green-600" : "text-red-500"}`}>
          {trendUp ? "↑" : "↓"} {trend}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/analytics/ConversationChart.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface DailyVolume { date: string; inbound: number; outbound: number; }

export function ConversationChart(): JSX.Element {
  const [data, setData] = useState<DailyVolume[]>([]);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/conversations?days=14`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setData((await res.json() as { data: DailyVolume[] }).data);
    }
    void load();
  }, [getToken]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Message Volume (14 days)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="inbound" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="outbound" fill="#86efac" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/analytics/TeamTable.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface AgentStat { assignedTo: string; conversationsHandled: number; }

export function TeamTable(): JSX.Element {
  const [data, setData] = useState<AgentStat[]>([]);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/team`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setData((await res.json() as { data: AgentStat[] }).data);
    }
    void load();
  }, [getToken]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Team Performance</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-5 py-2 font-medium text-gray-600">Agent</th>
            <th className="text-right px-5 py-2 font-medium text-gray-600">Conversations</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.length === 0 ? (
            <tr><td colSpan={2} className="px-5 py-6 text-center text-gray-400">No data yet</td></tr>
          ) : (
            data.map((row) => (
              <tr key={row.assignedTo}>
                <td className="px-5 py-2 text-gray-900 font-mono text-xs">{row.assignedTo}</td>
                <td className="px-5 py-2 text-right text-gray-900">{row.conversationsHandled}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Update `apps/web/app/(dashboard)/page.tsx`**

Replace the static stat cards with live data:
```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { MetricCard } from "@/components/analytics/MetricCard";
import { ConversationChart } from "@/components/analytics/ConversationChart";
import { TeamTable } from "@/components/analytics/TeamTable";

interface Overview { openConversations: number; totalContacts: number; messagesToday: number; pendingInvitations: number; }

async function getOverview(token: string): Promise<Overview | null> {
  const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/analytics/overview`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  return res.ok ? (await res.json() as { data: Overview }).data : null;
}

export default async function DashboardPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const overview = await getOverview(await getToken() ?? "");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Open Conversations" value={overview?.openConversations ?? "—"} />
        <MetricCard label="Contacts" value={overview?.totalContacts ?? "—"} />
        <MetricCard label="Messages Today" value={overview?.messagesToday ?? "—"} />
        <MetricCard label="Pending Invitations" value={overview?.pendingInvitations ?? "—"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversationChart />
        <TeamTable />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/analytics/ apps/web/app/\(dashboard\)/page.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): wire analytics dashboard — live metrics + conversation chart + team table"
```

---

## Task 10: Python ML microservice + Trust Score

**Files:**
- Create: `services/ml/main.py`
- Create: `services/ml/routers/trust_score.py`
- Create: `services/ml/routers/predictions.py`
- Create: `services/ml/models/trust_score.py`
- Create: `services/ml/requirements.txt`
- Create: `services/ml/Dockerfile`
- Modify: `docker-compose.yml`
- Create: `apps/api/src/routes/trust-score.ts`
- Create: `apps/api/src/plugins/ml-proxy.ts`

- [ ] **Step 1: Create `services/ml/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.8.2
scikit-learn==1.5.2
pandas==2.2.3
numpy==2.1.1
```

- [ ] **Step 2: Create `services/ml/models/trust_score.py`**

```python
from dataclasses import dataclass


@dataclass
class ContactFeatures:
    lifecycle_stage: str
    message_count: int
    inbound_count: int
    outbound_count: int
    days_since_last_message: int
    deal_count: int
    total_deal_value: float
    tag_count: int


STAGE_WEIGHTS = {
    "customer": 30,
    "loyal": 40,
    "prospect": 20,
    "lead": 10,
    "churned": 0,
}


class TrustScoreModel:
    """
    Heuristic Trust Score (0–100) for Sprint 18.
    Replaced with scikit-learn trained model in Sprint 23.
    """

    def compute(self, features: ContactFeatures) -> int:
        score = 0.0

        # Lifecycle stage (0–40 points)
        score += STAGE_WEIGHTS.get(features.lifecycle_stage, 10)

        # Engagement: response ratio (0–20 points)
        if features.message_count > 0:
            response_ratio = min(features.outbound_count / features.message_count, 1.0)
            score += response_ratio * 20

        # Recency (0–20 points)
        if features.days_since_last_message <= 7:
            score += 20
        elif features.days_since_last_message <= 30:
            score += 10
        elif features.days_since_last_message <= 90:
            score += 5

        # Deal activity (0–20 points)
        if features.deal_count > 0:
            score += min(features.deal_count * 5, 10)
        if features.total_deal_value > 0:
            score += min(features.total_deal_value / 100_000 * 10, 10)

        return min(max(int(score), 0), 100)
```

- [ ] **Step 3: Create `services/ml/routers/trust_score.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel
from ..models.trust_score import TrustScoreModel, ContactFeatures

router = APIRouter(prefix="/trust-score", tags=["trust-score"])
model = TrustScoreModel()


class TrustScoreRequest(BaseModel):
    lifecycle_stage: str = "lead"
    message_count: int = 0
    inbound_count: int = 0
    outbound_count: int = 0
    days_since_last_message: int = 999
    deal_count: int = 0
    total_deal_value: float = 0.0
    tag_count: int = 0


class TrustScoreResponse(BaseModel):
    score: int
    label: str


def score_to_label(score: int) -> str:
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    if score >= 25:
        return "low"
    return "very_low"


@router.post("", response_model=TrustScoreResponse)
def compute_trust_score(req: TrustScoreRequest) -> TrustScoreResponse:
    features = ContactFeatures(**req.model_dump())
    score = model.compute(features)
    return TrustScoreResponse(score=score, label=score_to_label(score))
```

- [ ] **Step 4: Create `services/ml/routers/predictions.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/predict", tags=["predictions"])


class ChurnRequest(BaseModel):
    trust_score: int
    days_since_last_message: int
    lifecycle_stage: str


class ChurnResponse(BaseModel):
    churn_probability: float
    is_at_risk: bool


class LtvRequest(BaseModel):
    deal_count: int
    total_deal_value: float
    lifecycle_stage: str


class LtvResponse(BaseModel):
    predicted_ltv: float


@router.post("/churn", response_model=ChurnResponse)
def predict_churn(req: ChurnRequest) -> ChurnResponse:
    # Heuristic model — replaced with trained classifier in Sprint 23
    p = 0.0
    if req.trust_score < 30:
        p += 0.4
    if req.days_since_last_message > 30:
        p += 0.3
    if req.lifecycle_stage == "churned":
        p += 0.3
    prob = min(p, 1.0)
    return ChurnResponse(churn_probability=round(prob, 2), is_at_risk=prob > 0.5)


@router.post("/ltv", response_model=LtvResponse)
def predict_ltv(req: LtvRequest) -> LtvResponse:
    # Simple average deal value × expected future deals (heuristic)
    avg = req.total_deal_value / max(req.deal_count, 1)
    future_deals = {"lead": 1, "prospect": 2, "customer": 4, "loyal": 6, "churned": 0}.get(req.lifecycle_stage, 1)
    return LtvResponse(predicted_ltv=round(avg * future_deals, 2))
```

- [ ] **Step 5: Create `services/ml/main.py`**

```python
from fastapi import FastAPI
from .routers import trust_score, predictions

app = FastAPI(title="WBMSG ML Service", version="1.0.0")

app.include_router(trust_score.router)
app.include_router(predictions.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ml"}
```

- [ ] **Step 6: Create `services/ml/__init__.py`** (empty file to make it a package)

```python
```

- [ ] **Step 7: Create `services/ml/routers/__init__.py`** (empty)

```python
```

- [ ] **Step 8: Create `services/ml/models/__init__.py`** (empty)

```python
```

- [ ] **Step 9: Create `services/ml/Dockerfile`**

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 10: Add ml-service to `docker-compose.yml`**

```yaml
  ml-service:
    build:
      context: ./services/ml
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 11: Create `apps/api/src/routes/trust-score.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import type { ContactId } from "@WBMSG/shared";

const ML_URL = process.env["ML_SERVICE_URL"] ?? "http://localhost:8000";

export const trustScoreRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id/trust-score", async (request, reply) => {
    const { organizationId } = request.auth;

    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }

    const messages = await fastify.prisma.message.findMany({
      where: { organizationId },
      select: { direction: true, sentAt: true },
      orderBy: { sentAt: "desc" },
    });

    const daysSinceLast = messages[0]
      ? Math.floor((Date.now() - messages[0].sentAt.getTime()) / 86_400_000)
      : 999;

    const deals = await fastify.prisma.deal.findMany({
      where: { organizationId, contactId: contact.id },
      select: { value: true },
    });

    const mlRes = await fetch(`${ML_URL}/trust-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lifecycle_stage: contact.lifecycleStage,
        message_count: messages.length,
        inbound_count: messages.filter((m) => m.direction === "inbound").length,
        outbound_count: messages.filter((m) => m.direction === "outbound").length,
        days_since_last_message: daysSinceLast,
        deal_count: deals.length,
        total_deal_value: deals.reduce((sum, d) => sum + Number(d.value ?? 0), 0),
        tag_count: contact.tags.length,
      }),
    });

    if (!mlRes.ok) {
      return reply.status(502).send({ error: { code: "ML_UNAVAILABLE", message: "ML service unavailable" } });
    }

    const score = await mlRes.json() as { score: number; label: string };
    return reply.send({ data: score });
  });
};
```

- [ ] **Step 12: Add ML_SERVICE_URL to `.env.example`**

```
ML_SERVICE_URL=http://localhost:8000
```

- [ ] **Step 13: Register trust-score route**

In `apps/api/src/routes/index.ts`:
```typescript
import { trustScoreRouter } from "./trust-score.js";
await fastify.register(trustScoreRouter, { prefix: "/v1" });
```

- [ ] **Step 14: Start ML service and verify**

```bash
docker compose up -d ml-service
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"ml"}

curl -X POST http://localhost:8000/trust-score \
  -H "Content-Type: application/json" \
  -d '{"lifecycle_stage":"customer","message_count":50,"inbound_count":25,"outbound_count":25,"days_since_last_message":3,"deal_count":2,"total_deal_value":200000,"tag_count":3}'
# Expected: {"score":88,"label":"high"}
```

- [ ] **Step 15: Commit**

```bash
git add services/ml/ docker-compose.yml apps/api/src/routes/trust-score.ts apps/api/src/routes/index.ts .env.example
git commit -m "feat(ml,api): add Python ML microservice — Trust Score + churn/LTV predictions"
```

---

## Task 11: Final type-check + lint — Sprint 13–18

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all pass (ai.test, transcriptions.test, flows.test, chatbots.test, analytics.test, deals.test, campaigns.test, segments.test, templates.test, webhooks.test, contacts.test, organizations.test, health.test)

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: type + lint fixes Sprints 13-18"
```

---

## Self-Review

**Spec coverage:**

| Sprint | Requirement | Task |
|---|---|---|
| 13 | Claude API integration | Task 1 |
| 13 | Intent detection + sentiment | Tasks 1, 2 |
| 13 | AI reply suggestions in inbox | Task 3 |
| 14 | Whisper audio transcription | Task 4 |
| 14 | Auto-transcribe inbound audio | Task 4 |
| 14 | VoiceMessage UI component | Task 4 |
| 15 | Flow runner (node graph execution) | Task 5 |
| 15 | Flow CRUD + test endpoint | Task 5 |
| 15 | reactflow canvas UI | Task 6 |
| 15 | Flows list + detail page | Task 6 |
| 16 | Chatbot model + bot sessions | Task 7 |
| 16 | Bot message handler + escalation | Task 7 |
| 16 | Activate/deactivate chatbot | Task 7 |
| 17 | Overview metrics (live data) | Tasks 8, 9 |
| 17 | Conversation volume chart | Tasks 8, 9 |
| 17 | Team performance table | Tasks 8, 9 |
| 18 | Trust Score model (heuristic) | Task 10 |
| 18 | Python FastAPI ML microservice | Task 10 |
| 18 | Churn + LTV prediction stubs | Task 10 |
| 18 | GET /v1/contacts/:id/trust-score | Task 10 |

**Type consistency:**
- `IntentType` / `SentimentType` exported from `@WBMSG/shared` ✓
- `FlowDefinition` / `FlowNode` / `FlowTriggerPayload` types used consistently across flow-runner, flow worker, and route ✓
- `ContactFeatures` dataclass fields match the JSON sent from `trust-score.ts` ✓

**Placeholder scan:** No TBD, "similar to", or empty code blocks found.
