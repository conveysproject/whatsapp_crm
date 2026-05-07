# Cycle 5 — AI & Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the AI features that give TrustCRM its edge over WhatsJet — AI smart reply suggestions in inbox, intent detection badges on inbound messages, voice message transcription player, predictive analytics dashboard, Trust Score org/contact display, and Flowise AI bot integration as an alternative AI backend.

**Architecture:** All AI routes (`apps/api/src/routes/ai.ts`) and transcription routes already exist. This cycle completes the web UI integration. Flowise integration adds a new vendor setting key (`flowise_url`, `flowise_access_token`) and routes calls through Flowise instead of Anthropic when configured. No new Prisma models needed — existing schema covers all features.

**Tech Stack:** Prisma, Fastify 4 ESM, Next.js 15 App Router, Tailwind, React Query, Anthropic Claude API (`apps/api/src/lib/claude.ts`), Flowise REST API

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/api/src/routes/ai.ts` | Add Flowise fallback logic, /ai/smart-replies, /ai/intent endpoints |
| Modify | `apps/api/src/routes/ai.test.ts` | Tests for smart-replies and intent |
| Modify | `apps/web/app/(dashboard)/inbox/page.tsx` | Smart reply suggestions panel, intent badges |
| Create | `apps/web/components/smart-reply-panel.tsx` | AI suggested replies component |
| Create | `apps/web/components/intent-badge.tsx` | Intent label badge on messages |
| Create | `apps/web/components/voice-player.tsx` | Voice message player with transcript toggle |
| Modify | `apps/web/app/(dashboard)/inbox/page.tsx` | Integrate voice player for audio messages |
| Create | `apps/web/app/(dashboard)/analytics/predictive/page.tsx` | Predictive analytics: churn risk, high-value |
| Create | `apps/web/app/(dashboard)/trust-score/page.tsx` | Org trust score gauge + per-category breakdown |
| Create | `apps/web/app/(dashboard)/settings/ai/page.tsx` | AI backend config: Anthropic vs Flowise vs OpenAI |

---

## Task 1: AI Smart Replies + Intent Detection Endpoints

**Files:**
- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/routes/ai.test.ts`

- [ ] **Step 1: Write failing tests** — add to `ai.test.ts`:

```typescript
vi.mock("../lib/claude.js", () => ({
  generateSmartReplies: vi.fn().mockResolvedValue([
    "Thank you for reaching out! How can I help you today?",
    "We'd be happy to assist. Could you provide more details?",
    "Our team is on it. We'll get back to you shortly.",
  ]),
  detectIntent: vi.fn().mockResolvedValue({ intent: "purchase_inquiry", confidence: 0.91 }),
}));

describe("POST /v1/ai/smart-replies", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 3 smart reply suggestions for a conversation", async () => {
    mockPrisma.message = {
      findMany: vi.fn().mockResolvedValue([
        { body: "Hi, I want to know about your pricing", direction: "inbound" },
        { body: "Hello! We have plans starting at ₹999", direction: "outbound" },
      ]),
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/smart-replies",
      payload: { conversationId: "conv-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { replies: string[] } }>().data.replies).toHaveLength(3);
  });
});

describe("POST /v1/ai/intent", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns detected intent with confidence score", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/intent",
      payload: { messageId: "msg-1", text: "I want to buy your premium plan" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { intent: string; confidence: number } }>();
    expect(body.data.intent).toBe("purchase_inquiry");
    expect(body.data.confidence).toBeGreaterThan(0.8);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test ai
```

Expected: failures for `smart-replies` and `intent` endpoints

- [ ] **Step 3: Check what already exists in ai.ts**

```bash
grep -n "smart-replies\|intent\|smart_replies\|detectIntent" apps/api/src/routes/ai.ts
```

Note the output — implement only what's missing.

- [ ] **Step 4: Add smart replies endpoint to ai.ts**

In `apps/api/src/routes/ai.ts`, add inside the `aiRouter` function (after any existing routes):

```typescript
  // ── Smart replies ────────────────────────────────────────────────────────
  fastify.post<{ Body: { conversationId: string } }>("/ai/smart-replies", async (request, reply) => {
    const { organizationId } = request.auth;

    // Get recent messages for context
    const messages = await fastify.prisma.message.findMany({
      where: { conversationId: request.body.conversationId, organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { body: true, direction: true },
    });

    // Check if Flowise is configured for this org
    const flowise = await fastify.prisma.vendorSetting.findFirst({
      where: { organizationId, key: "flowise_url" },
    });

    let replies: string[];
    if (flowise?.value) {
      // Flowise fallback
      const flowiseSetting = await fastify.prisma.vendorSetting.findFirst({
        where: { organizationId, key: "flowise_access_token" },
      });
      const flowiseRes = await fetch(`${flowise.value}/api/v1/prediction/smart-replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(flowiseSetting?.value ? { Authorization: `Bearer ${flowiseSetting.value}` } : {}),
        },
        body: JSON.stringify({ messages: messages.reverse() }),
      });
      const flowiseData = await flowiseRes.json() as { replies?: string[] };
      replies = flowiseData.replies ?? [];
    } else {
      const { generateSmartReplies } = await import("../lib/claude.js");
      replies = await generateSmartReplies(messages.reverse());
    }

    return reply.send({ data: { replies } });
  });

  // ── Intent detection ─────────────────────────────────────────────────────
  fastify.post<{ Body: { messageId: string; text: string } }>("/ai/intent", async (request, reply) => {
    const { detectIntent } = await import("../lib/claude.js");
    const result = await detectIntent(request.body.text);
    return reply.send({ data: result });
  });
```

- [ ] **Step 5: Ensure `generateSmartReplies` and `detectIntent` exist in claude.ts**

```bash
grep -n "generateSmartReplies\|detectIntent" apps/api/src/lib/claude.ts
```

If either function is missing, add it to `apps/api/src/lib/claude.ts`:

```typescript
// Add to apps/api/src/lib/claude.ts:
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateSmartReplies(messages: { body: string; direction: string }[]): Promise<string[]> {
  const conversation = messages
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Given this WhatsApp conversation, suggest 3 short, helpful reply options for the agent. Return ONLY a JSON array of 3 strings, nothing else.\n\nConversation:\n${conversation}`,
    }],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "[]";
    const parsed = JSON.parse(text) as string[];
    return parsed.slice(0, 3);
  } catch {
    return ["Thank you for your message.", "Let me check on that for you.", "I'll get back to you shortly."];
  }
}

export async function detectIntent(text: string): Promise<{ intent: string; confidence: number }> {
  const intents = ["purchase_inquiry", "support_request", "complaint", "general_inquiry", "pricing", "refund_request"];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{
      role: "user",
      content: `Classify this message into one of these intents: ${intents.join(", ")}. Return ONLY a JSON object with "intent" and "confidence" (0-1). Message: "${text}"`,
    }],
  });

  try {
    const text2 = response.content[0].type === "text" ? response.content[0].text : "{}";
    return JSON.parse(text2) as { intent: string; confidence: number };
  } catch {
    return { intent: "general_inquiry", confidence: 0.5 };
  }
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test ai
```

Expected: `✓ all tests pass`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/ai.ts apps/api/src/routes/ai.test.ts apps/api/src/lib/claude.ts
git commit -m "feat(api): AI smart replies and intent detection endpoints with Flowise fallback"
```

---

## Task 2: Web — Smart Reply Panel Component

**Files:**
- Create: `apps/web/components/smart-reply-panel.tsx`
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create SmartReplyPanel component**

```tsx
// apps/web/components/smart-reply-panel.tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Props {
  conversationId: string;
  onSelect: (text: string) => void;
}

export function SmartReplyPanel({ conversationId, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ data: { replies: string[] } }>({
    queryKey: ["smart-replies", conversationId],
    queryFn: () =>
      fetch("/api/v1/ai/smart-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      }).then((r) => r.json()),
    enabled: open,
  });

  const replies = data?.data?.replies ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) refetch(); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-purple-200 text-purple-700 hover:bg-purple-50"
        title="AI suggested replies"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3 3 0 01-2.12-.88l-.347-.347z" />
        </svg>
        AI Replies
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 w-80 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-purple-50">
            <span className="text-xs font-medium text-purple-700">Suggested Replies</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          </div>
          {isLoading && <p className="p-3 text-xs text-gray-400">Generating suggestions...</p>}
          {!isLoading && replies.length === 0 && <p className="p-3 text-xs text-gray-400">No suggestions available.</p>}
          <ul>
            {replies.map((reply, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-purple-50 border-b last:border-b-0"
                  onClick={() => { onSelect(reply); setOpen(false); }}
                >
                  {reply}
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 py-2 border-t bg-gray-50">
            <button onClick={() => refetch()} className="text-xs text-purple-600 hover:underline">Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add SmartReplyPanel to inbox composer**

Find the inbox composer toolbar in `apps/web/app/(dashboard)/inbox/page.tsx`. Add beside the canned response picker:

```tsx
import { SmartReplyPanel } from "@/components/smart-reply-panel";

// In the composer toolbar:
{selectedConversation && (
  <SmartReplyPanel
    conversationId={selectedConversation.id}
    onSelect={(text) => setMessage(text)}
  />
)}
```

- [ ] **Step 3: Type-check and commit**

```bash
pnpm type-check
git add apps/web/components/smart-reply-panel.tsx apps/web/app/\(dashboard\)/inbox/
git commit -m "feat(web): AI smart reply panel in inbox composer"
```

---

## Task 3: Web — Intent Badge on Messages

**Files:**
- Create: `apps/web/components/intent-badge.tsx`
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create IntentBadge component**

```tsx
// apps/web/components/intent-badge.tsx
"use client";
import { useQuery } from "@tanstack/react-query";

const INTENT_COLORS: Record<string, string> = {
  purchase_inquiry: "bg-green-100 text-green-700",
  support_request: "bg-blue-100 text-blue-700",
  complaint: "bg-red-100 text-red-700",
  refund_request: "bg-orange-100 text-orange-700",
  pricing: "bg-yellow-100 text-yellow-700",
  general_inquiry: "bg-gray-100 text-gray-600",
};

const INTENT_LABELS: Record<string, string> = {
  purchase_inquiry: "Purchase Intent",
  support_request: "Support",
  complaint: "Complaint",
  refund_request: "Refund",
  pricing: "Pricing",
  general_inquiry: "General",
};

interface Props {
  messageId: string;
  text: string;
  direction: string;
}

export function IntentBadge({ messageId, text, direction }: Props) {
  const { data } = useQuery<{ data: { intent: string; confidence: number } }>({
    queryKey: ["intent", messageId],
    queryFn: () =>
      fetch("/api/v1/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, text }),
      }).then((r) => r.json()),
    enabled: direction === "inbound" && text.length > 5,
    staleTime: Infinity,
  });

  if (!data?.data || data.data.confidence < 0.7) return null;

  const { intent } = data.data;
  const color = INTENT_COLORS[intent] ?? "bg-gray-100 text-gray-600";
  const label = INTENT_LABELS[intent] ?? intent;

  return (
    <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-medium ml-2 ${color}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Add IntentBadge to inbound message bubbles in inbox**

Find where inbound message bubbles are rendered in `apps/web/app/(dashboard)/inbox/page.tsx`. Add the badge after the message text:

```tsx
import { IntentBadge } from "@/components/intent-badge";

// In the message bubble JSX for inbound messages:
{message.direction === "inbound" && (
  <IntentBadge
    messageId={message.id}
    text={message.body}
    direction={message.direction}
  />
)}
```

- [ ] **Step 3: Type-check and commit**

```bash
pnpm type-check
git add apps/web/components/intent-badge.tsx apps/web/app/\(dashboard\)/inbox/
git commit -m "feat(web): intent detection badge on inbound messages in inbox"
```

---

## Task 4: Web — Voice Message Player with Transcript

**Files:**
- Create: `apps/web/components/voice-player.tsx`
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create VoicePlayer component**

```tsx
// apps/web/components/voice-player.tsx
"use client";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

interface Props {
  mediaUrl: string;
  messageId: string;
  duration?: number;
}

export function VoicePlayer({ mediaUrl, messageId, duration }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const totalDuration = duration ?? 0;

  const { data: transcription, isLoading: transcribing } = useQuery<{ data: { text: string } }>({
    queryKey: ["transcription", messageId],
    queryFn: () => fetch(`/api/v1/transcriptions/${messageId}`).then((r) => r.json()),
    enabled: showTranscript,
    staleTime: Infinity,
  });

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700 flex-shrink-0"
        >
          {playing ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="flex-1">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 rounded-full transition-all"
              style={{ width: totalDuration > 0 ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
            />
          </div>
        </div>
        <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
      </div>

      <button
        onClick={() => setShowTranscript((v) => !v)}
        className="text-xs text-blue-600 hover:underline text-left"
      >
        {showTranscript ? "Hide transcript" : "Show transcript"}
      </button>

      {showTranscript && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-1">
          {transcribing ? "Transcribing..." : (transcription?.data?.text ?? "No transcript available.")}
        </div>
      )}

      <audio
        ref={audioRef}
        src={mediaUrl}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
```

- [ ] **Step 2: Integrate VoicePlayer in inbox message list**

Find where audio/voice messages are rendered in `apps/web/app/(dashboard)/inbox/page.tsx`. Replace any placeholder with:

```tsx
import { VoicePlayer } from "@/components/voice-player";

// In message rendering, for audio type messages:
{message.mediaType === "audio" && message.mediaUrl && (
  <VoicePlayer
    mediaUrl={message.mediaUrl}
    messageId={message.id}
    duration={message.mediaDuration}
  />
)}
```

- [ ] **Step 3: Type-check and commit**

```bash
pnpm type-check
git add apps/web/components/voice-player.tsx apps/web/app/\(dashboard\)/inbox/
git commit -m "feat(web): voice message player with transcript toggle in inbox"
```

---

## Task 5: Web — Predictive Analytics Dashboard

**Files:**
- Create: `apps/web/app/(dashboard)/analytics/predictive/page.tsx`

- [ ] **Step 1: Create predictive analytics page**

```tsx
// apps/web/app/(dashboard)/analytics/predictive/page.tsx
"use client";
import { useQuery } from "@tanstack/react-query";

interface PredictiveContact {
  id: string;
  name: string;
  phone: string;
  trustScore: number | null;
  riskLevel: "high" | "medium" | "low";
  prediction: string;
}

interface PredictiveData {
  churnRisk: PredictiveContact[];
  highValue: PredictiveContact[];
  reorderCandidates: PredictiveContact[];
}

export default function PredictiveAnalyticsPage() {
  const { data, isLoading } = useQuery<{ data: PredictiveData }>({
    queryKey: ["predictive-analytics"],
    queryFn: () => fetch("/api/v1/ai/predictive").then((r) => r.json()),
  });

  const riskColor = {
    high: "text-red-600 bg-red-50",
    medium: "text-yellow-600 bg-yellow-50",
    low: "text-green-600 bg-green-50",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Predictive Analytics</h1>

      {isLoading && <p className="text-sm text-gray-400">Analysing your contacts...</p>}

      {!isLoading && data && (
        <>
          {/* Churn Risk */}
          <section>
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              Churn Risk
              <span className="text-sm font-normal text-gray-500">{data.data.churnRisk.length} contacts at risk</span>
            </h2>
            <div className="border rounded-lg divide-y">
              {data.data.churnRisk.length === 0 && <p className="p-4 text-sm text-gray-400">No contacts at churn risk.</p>}
              {data.data.churnRisk.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-sm">{c.name || c.phone}</p>
                    <p className="text-xs text-gray-500">{c.prediction}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.trustScore != null && <span className="text-sm font-medium">{c.trustScore}%</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${riskColor[c.riskLevel]}`}>{c.riskLevel} risk</span>
                    <a href={`/contacts/${c.id}`} className="text-xs text-blue-600 hover:underline">View</a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* High Value */}
          <section>
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              High Value Contacts
              <span className="text-sm font-normal text-gray-500">{data.data.highValue.length} contacts</span>
            </h2>
            <div className="border rounded-lg divide-y">
              {data.data.highValue.length === 0 && <p className="p-4 text-sm text-gray-400">No high-value contacts identified.</p>}
              {data.data.highValue.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-sm">{c.name || c.phone}</p>
                    <p className="text-xs text-gray-500">{c.prediction}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.trustScore != null && <span className="text-sm font-medium text-green-600">{c.trustScore}%</span>}
                    <a href={`/contacts/${c.id}`} className="text-xs text-blue-600 hover:underline">View</a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Reorder Candidates */}
          <section>
            <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Reorder Candidates
              <span className="text-sm font-normal text-gray-500">{data.data.reorderCandidates.length} contacts</span>
            </h2>
            <div className="border rounded-lg divide-y">
              {data.data.reorderCandidates.length === 0 && <p className="p-4 text-sm text-gray-400">No reorder candidates.</p>}
              {data.data.reorderCandidates.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-sm">{c.name || c.phone}</p>
                    <p className="text-xs text-gray-500">{c.prediction}</p>
                  </div>
                  <a href={`/contacts/${c.id}`} className="text-xs text-blue-600 hover:underline">View</a>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/analytics/
git commit -m "feat(web): predictive analytics dashboard — churn risk, high value, reorder candidates"
```

---

## Task 6: Web — Trust Score Dashboard

**Files:**
- Create: `apps/web/app/(dashboard)/trust-score/page.tsx`

- [ ] **Step 1: Create trust score page**

```tsx
// apps/web/app/(dashboard)/trust-score/page.tsx
"use client";
import { useQuery } from "@tanstack/react-query";

interface TrustScoreData {
  score: number;
  grade: string;
  breakdown: { category: string; score: number; maxScore: number; description: string }[];
  recommendations: string[];
}

function ScoreGauge({ score }: { score: number }) {
  const angle = (score / 100) * 180 - 90;
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-24 overflow-hidden">
        <div className="w-48 h-48 rounded-full border-8 border-gray-100 absolute top-0" />
        <div
          className="w-1 h-20 bg-gray-800 absolute bottom-0 left-1/2 origin-bottom rounded-full transition-transform"
          style={{ transform: `rotate(${angle}deg)` }}
        />
      </div>
      <p className={`text-5xl font-bold mt-2 ${color}`}>{score}</p>
      <p className={`text-sm font-medium ${color}`}>{score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Attention"}</p>
    </div>
  );
}

export default function TrustScorePage() {
  const { data, isLoading } = useQuery<{ data: TrustScoreData }>({
    queryKey: ["trust-score"],
    queryFn: () => fetch("/api/v1/trust-score").then((r) => r.json()),
  });

  const ts = data?.data;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Trust Score</h1>

      {isLoading && <p className="text-sm text-gray-400">Calculating trust score...</p>}

      {!isLoading && ts && (
        <>
          <div className="border rounded-lg p-8 flex flex-col items-center">
            <ScoreGauge score={ts.score} />
            <p className="text-sm text-gray-500 mt-4 text-center max-w-sm">
              Your trust score reflects customer engagement, response rates, template quality, and conversation outcomes.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-4">Score Breakdown</h2>
            <div className="border rounded-lg divide-y">
              {(ts.breakdown ?? []).map((item) => (
                <div key={item.category} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">{item.category}</p>
                    <p className="text-sm font-medium">{item.score}/{item.maxScore}</p>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full">
                    <div
                      className="h-2 bg-green-500 rounded-full transition-all"
                      style={{ width: `${(item.score / item.maxScore) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {(ts.recommendations ?? []).length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">Recommendations</h2>
              <ul className="space-y-2">
                {ts.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-600 mt-0.5">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/trust-score/
git commit -m "feat(web): trust score dashboard with gauge, breakdown, and recommendations"
```

---

## Task 7: Web — AI Settings Page (Anthropic vs Flowise vs OpenAI)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/ai/page.tsx`

- [ ] **Step 1: Create AI settings page**

```tsx
// apps/web/app/(dashboard)/settings/ai/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type AIBackend = "anthropic" | "flowise" | "openai";

export default function AISettingsPage() {
  const qc = useQueryClient();
  const [backend, setBackend] = useState<AIBackend>("anthropic");
  const [flowiseUrl, setFlowiseUrl] = useState("");
  const [flowiseToken, setFlowiseToken] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");

  const { data: settings } = useQuery<{ data: Record<string, string> }>({
    queryKey: ["vendor-settings"],
    queryFn: () => fetch("/api/v1/vendor-settings").then((r) => r.json()),
  });

  useEffect(() => {
    if (!settings?.data) return;
    if (settings.data.flowise_url) { setBackend("flowise"); setFlowiseUrl(settings.data.flowise_url); }
    if (settings.data.flowise_access_token) setFlowiseToken(settings.data.flowise_access_token);
    if (settings.data.open_ai_access_key) { setBackend("openai"); setOpenAiKey(settings.data.open_ai_access_key); }
  }, [settings]);

  const save = useMutation({
    mutationFn: () => {
      const settingsList = [
        { key: "enable_flowise_ai_bot", value: String(backend === "flowise"), dataType: "boolean" },
        { key: "flowise_url", value: backend === "flowise" ? flowiseUrl : "", dataType: "string" },
        { key: "flowise_access_token", value: backend === "flowise" ? flowiseToken : "", dataType: "string" },
        { key: "enable_open_ai_bot", value: String(backend === "openai"), dataType: "boolean" },
        { key: "open_ai_access_key", value: backend === "openai" ? openAiKey : "", dataType: "string" },
      ];
      return fetch("/api/v1/vendor-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: settingsList }),
      }).then((r) => r.json());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">AI Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">Choose the AI backend for smart replies, intent detection, and chatbot responses.</p>
      </div>

      <div className="space-y-4">
        {/* Anthropic */}
        <div className={`border rounded-lg p-4 cursor-pointer ${backend === "anthropic" ? "border-purple-400 bg-purple-50" : ""}`} onClick={() => setBackend("anthropic")}>
          <div className="flex items-start gap-3">
            <input type="radio" checked={backend === "anthropic"} onChange={() => setBackend("anthropic")} className="mt-0.5" />
            <div>
              <p className="font-medium text-sm">Anthropic Claude (Default)</p>
              <p className="text-xs text-gray-500">Uses TrustCRM's built-in Claude Haiku for fast, accurate AI responses. No configuration needed.</p>
            </div>
          </div>
        </div>

        {/* Flowise */}
        <div className={`border rounded-lg p-4 cursor-pointer ${backend === "flowise" ? "border-blue-400 bg-blue-50" : ""}`} onClick={() => setBackend("flowise")}>
          <div className="flex items-start gap-3">
            <input type="radio" checked={backend === "flowise"} onChange={() => setBackend("flowise")} className="mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Flowise (Custom AI)</p>
              <p className="text-xs text-gray-500 mb-3">Connect your own Flowise instance for custom AI flows and RAG-based responses.</p>
              {backend === "flowise" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Flowise URL</label>
                    <input
                      className="w-full border rounded px-3 py-1.5 text-sm"
                      placeholder="https://your-flowise.example.com"
                      value={flowiseUrl}
                      onChange={(e) => setFlowiseUrl(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Access Token (optional)</label>
                    <input
                      type="password"
                      className="w-full border rounded px-3 py-1.5 text-sm"
                      placeholder="Bearer token"
                      value={flowiseToken}
                      onChange={(e) => setFlowiseToken(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* OpenAI */}
        <div className={`border rounded-lg p-4 cursor-pointer ${backend === "openai" ? "border-green-400 bg-green-50" : ""}`} onClick={() => setBackend("openai")}>
          <div className="flex items-start gap-3">
            <input type="radio" checked={backend === "openai"} onChange={() => setBackend("openai")} className="mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">OpenAI</p>
              <p className="text-xs text-gray-500 mb-3">Use your own OpenAI API key for GPT-based responses.</p>
              {backend === "openai" && (
                <div>
                  <label className="block text-xs font-medium mb-1">OpenAI API Key</label>
                  <input
                    type="password"
                    className="w-full border rounded px-3 py-1.5 text-sm"
                    placeholder="sk-..."
                    value={openAiKey}
                    onChange={(e) => setOpenAiKey(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-6 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
      >
        {save.isPending ? "Saving..." : "Save AI Settings"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/settings/ai/
git commit -m "feat(web): AI backend settings page — Anthropic, Flowise, OpenAI"
```

---

## Task 8: Full test run + type-check

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass

- [ ] **Step 2: Full type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(cycle5): AI & Intelligence — smart replies, intent badges, voice player, predictive analytics, trust score, Flowise integration"
```

---

## Cycle 5 Acceptance Criteria

- [ ] In inbox, click "AI Replies" button — 3 context-aware suggestions appear within 2 seconds
- [ ] Inbound message "I want to buy the premium plan" shows badge "Purchase Intent"
- [ ] Voice message shows play button + "Show transcript" link; transcript loads via Whisper
- [ ] Predictive analytics page shows at least one churn risk or high-value section with contacts
- [ ] Trust Score page shows gauge with score and category breakdown
- [ ] AI settings page: switch to Flowise, enter URL — subsequent smart replies call Flowise instead of Anthropic
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
