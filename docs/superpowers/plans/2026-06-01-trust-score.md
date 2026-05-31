# Trust Score Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Trust Score platform — org-level history/trend chart with actionable recommendations, plus per-contact trust scores in the contacts list, contact detail panel, and inbox conversation header.

**Architecture:** A new `OrgTrustScoreSnapshot` Prisma model stores daily org-level snapshots written by a BullMQ worker (following the `message-cleanup.ts` pattern). `GET /v1/trust-score` gains `?history=true` and changes `recommendations` from `string[]` to `{ text, href }[]`. Per-contact scores are fetched live from the ML service and displayed via a shared `ContactTrustBadge` component with `IntersectionObserver`-based lazy loading.

**Tech Stack:** Fastify 4, Prisma, BullMQ, Redis (API); React Query, SVG (Web); Vitest (tests).

---

## File Map

**Create:**
- `apps/api/src/workers/trust-score.ts` — BullMQ queue + worker + cron scheduler
- `apps/api/src/routes/trust-score.test.ts` — API route tests
- `apps/api/src/workers/trust-score.test.ts` — Worker unit tests
- `apps/web/components/trust-score/TrustTrendChart.tsx` — SVG line chart
- `apps/web/components/trust-score/ContactTrustBadge.tsx` — Reusable trust badge

**Modify:**
- `apps/api/prisma/schema.prisma` — add `OrgTrustScoreSnapshot` model
- `apps/api/src/routes/trust-score.ts` — history param + recommendations shape change
- `apps/api/src/index.ts` — register trust-score worker + cron
- `apps/web/app/(dashboard)/trust-score/page.tsx` — add chart + actionable recs
- `apps/web/components/contacts/ContactsClient.tsx` — add Trust column
- `apps/web/app/(dashboard)/contacts/[id]/ContactDetailSidebar.tsx` — add Trust section
- `apps/web/app/(dashboard)/inbox/page.tsx` — add trust badge to conversation header

---

## Task 1: Prisma Schema — Add OrgTrustScoreSnapshot

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the model to schema.prisma**

  Open `apps/api/prisma/schema.prisma`. Find the last model in the file and append after it:

  ```prisma
  model OrgTrustScoreSnapshot {
    id             String   @id @default(uuid())
    organizationId String   @map("organization_id")
    score          Int
    breakdown      Json
    recordedAt     DateTime @default(now()) @map("recorded_at")

    @@index([organizationId, recordedAt])
    @@map("org_trust_score_snapshots")
  }
  ```

- [ ] **Step 2: Push schema to the database**

  ```powershell
  pnpm --filter @WBMSG/api exec prisma db push --accept-data-loss
  ```

  Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Create migration file manually**

  Create directory and file:
  ```
  apps/api/prisma/migrations/20260601120000_add_org_trust_score_snapshot/migration.sql
  ```

  File contents:
  ```sql
  -- CreateTable
  CREATE TABLE "org_trust_score_snapshots" (
      "id" TEXT NOT NULL,
      "organization_id" TEXT NOT NULL,
      "score" INTEGER NOT NULL,
      "breakdown" JSONB NOT NULL,
      "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "org_trust_score_snapshots_pkey" PRIMARY KEY ("id")
  );

  -- CreateIndex
  CREATE INDEX "org_trust_score_snapshots_organization_id_recorded_at_idx" ON "org_trust_score_snapshots"("organization_id", "recorded_at");
  ```

- [ ] **Step 4: Mark migration as applied**

  ```powershell
  pnpm --filter @WBMSG/api exec prisma migrate resolve --applied 20260601120000_add_org_trust_score_snapshot
  ```

  Expected output: `Migration 20260601120000_add_org_trust_score_snapshot marked as applied`

- [ ] **Step 5: Regenerate Prisma client**

  ```powershell
  pnpm --filter @WBMSG/api generate
  ```

  Expected output: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260601120000_add_org_trust_score_snapshot/
  git commit -m "feat(trust-score): add OrgTrustScoreSnapshot schema model"
  ```

---

## Task 2: API Route Tests (write failing)

**Files:**
- Create: `apps/api/src/routes/trust-score.test.ts`

- [ ] **Step 1: Create the test file**

  ```typescript
  // apps/api/src/routes/trust-score.test.ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
  import Fastify, { type FastifyInstance } from "fastify";
  import type { PrismaClient } from "@prisma/client";

  const mockPrisma = {
    message: { count: vi.fn() },
    contact: { count: vi.fn() },
    campaign: { findMany: vi.fn() },
    orgTrustScoreSnapshot: { findMany: vi.fn() },
    deal: { findMany: vi.fn() },
  };

  const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

  async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
    const { trustScoreRouter } = await import("./trust-score.js");
    await app.register(trustScoreRouter, { prefix: "/v1" });
    return app;
  }

  describe("GET /v1/trust-score", () => {
    let app: FastifyInstance;
    beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
    afterEach(async () => { await app.close(); });

    it("returns score as sum of 4 category scores", async () => {
      mockPrisma.message.count
        .mockResolvedValueOnce(100)   // totalMessages
        .mockResolvedValueOnce(90)    // deliveredMessages
        .mockResolvedValueOnce(20);   // inboundMessages
      mockPrisma.contact.count
        .mockResolvedValueOnce(50)    // totalContacts
        .mockResolvedValueOnce(40);   // contactsWithTags
      mockPrisma.campaign.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);

      const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { score: number; breakdown: { category: string; score: number; maxScore: number }[] } }>();
      expect(body.data.breakdown).toHaveLength(4);
      // deliveryScore=27, responseScore=5, contactScore=20, campaignScore=4 → total=56
      expect(body.data.score).toBe(body.data.breakdown.reduce((s, b) => s + b.score, 0));
    });

    it("returns recommendations as { text, href }[] objects", async () => {
      mockPrisma.message.count.mockResolvedValue(0);
      mockPrisma.contact.count.mockResolvedValue(0);
      mockPrisma.campaign.findMany.mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
      const body = res.json<{ data: { recommendations: unknown[] } }>();
      // At minimum the "run first campaign" recommendation should appear
      expect(body.data.recommendations.length).toBeGreaterThan(0);
      const first = body.data.recommendations[0] as { text: string; href: string };
      expect(typeof first.text).toBe("string");
      expect(typeof first.href).toBe("string");
      expect(first.href).toMatch(/^\//);
    });

    it("does NOT include history when history param is absent", async () => {
      mockPrisma.message.count.mockResolvedValue(0);
      mockPrisma.contact.count.mockResolvedValue(0);
      mockPrisma.campaign.findMany.mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: "/v1/trust-score" });
      const body = res.json<{ data: { history?: unknown } }>();
      expect(body.data.history).toBeUndefined();
    });

    it("includes history array ordered ascending when ?history=true", async () => {
      mockPrisma.message.count.mockResolvedValue(0);
      mockPrisma.contact.count.mockResolvedValue(0);
      mockPrisma.campaign.findMany.mockResolvedValue([]);
      mockPrisma.orgTrustScoreSnapshot.findMany.mockResolvedValue([
        { score: 60, recordedAt: new Date("2026-05-01T02:00:00Z") },
        { score: 70, recordedAt: new Date("2026-05-02T02:00:00Z") },
      ]);

      const res = await app.inject({ method: "GET", url: "/v1/trust-score?history=true" });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { history: { score: number; recordedAt: string }[] } }>();
      expect(body.data.history).toHaveLength(2);
      expect(body.data.history[0]!.score).toBe(60);
      expect(body.data.history[1]!.score).toBe(70);
      expect(typeof body.data.history[0]!.recordedAt).toBe("string");
    });
  });

  describe("GET /v1/contacts/:id/trust-score", () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      vi.resetModules();
      vi.clearAllMocks();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ score: 75, label: "high" }),
      }));
      app = await buildApp();
    });
    afterEach(async () => { vi.unstubAllGlobals(); await app.close(); });

    it("returns { score, label } from ML service for a known contact", async () => {
      mockPrisma.contact.count.mockResolvedValue(1);  // not used directly but needed
      // findFirst used by the contact lookup — we need to add contact.findFirst to mock
      (mockPrisma as unknown as Record<string, unknown>).contact = {
        ...mockPrisma.contact,
        findFirst: vi.fn().mockResolvedValue({
          id: "c-1",
          organizationId: "org-1",
          lifecycleStage: "customer",
          tags: ["vip"],
        }),
      };
      (mockPrisma as unknown as Record<string, unknown>).message = {
        ...mockPrisma.message,
        findMany: vi.fn().mockResolvedValue([
          { direction: "inbound", sentAt: new Date() },
          { direction: "outbound", sentAt: new Date() },
        ]),
      };
      mockPrisma.deal.findMany.mockResolvedValue([{ value: 5000 }]);

      const res = await app.inject({ method: "GET", url: "/v1/contacts/c-1/trust-score" });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: { score: number; label: string } }>();
      expect(body.data.score).toBe(75);
      expect(body.data.label).toBe("high");
    });

    it("returns 404 when contact not found", async () => {
      (mockPrisma as unknown as Record<string, unknown>).contact = {
        ...mockPrisma.contact,
        findFirst: vi.fn().mockResolvedValue(null),
      };
      const res = await app.inject({ method: "GET", url: "/v1/contacts/bad-id/trust-score" });
      expect(res.statusCode).toBe(404);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```powershell
  pnpm --filter @WBMSG/api exec vitest run src/routes/trust-score.test.ts
  ```

  Expected: Tests fail because recommendations are `string[]` not `{ text, href }[]` and `history` is not implemented.

---

## Task 3: API Route Update (make tests pass)

**Files:**
- Modify: `apps/api/src/routes/trust-score.ts`

- [ ] **Step 1: Replace the full content of `apps/api/src/routes/trust-score.ts`**

  ```typescript
  import type { FastifyPluginAsync } from "fastify";
  import type { ContactId } from "@WBMSG/shared";

  const ML_URL = process.env["ML_SERVICE_URL"] ?? "http://localhost:8000";

  interface Recommendation {
    text: string;
    href: string;
  }

  export const trustScoreRouter: FastifyPluginAsync = async (fastify) => {
    fastify.get<{ Querystring: { history?: string } }>("/trust-score", async (request, reply) => {
      const { organizationId } = request.auth;

      const [totalMessages, deliveredMessages, inboundMessages, totalContacts, contactsWithTags, campaigns] =
        await Promise.all([
          fastify.prisma.message.count({ where: { organizationId, direction: "outbound" } }),
          fastify.prisma.message.count({ where: { organizationId, direction: "outbound", status: "delivered" } }),
          fastify.prisma.message.count({ where: { organizationId, direction: "inbound" } }),
          fastify.prisma.contact.count({ where: { organizationId, deletedAt: null } }),
          fastify.prisma.contact.count({ where: { organizationId, deletedAt: null, tags: { isEmpty: false } } }),
          fastify.prisma.campaign.findMany({
            where: { organizationId, status: "completed" },
            select: { id: true },
            take: 50,
          }),
        ]);

      const deliveryRate = totalMessages > 0 ? deliveredMessages / totalMessages : 0;
      const deliveryScore = Math.round(deliveryRate * 30);
      const deliveryDesc = totalMessages === 0
        ? "No outbound messages yet"
        : `${deliveredMessages} of ${totalMessages} messages delivered`;

      const responseRate = totalMessages > 0 ? Math.min(1, inboundMessages / totalMessages) : 0;
      const responseScore = Math.round(responseRate * 25);
      const responseDesc = `${inboundMessages} inbound replies vs ${totalMessages} outbound messages`;

      const contactQualityRate = totalContacts > 0 ? contactsWithTags / totalContacts : 0;
      const contactScore = Math.round(contactQualityRate * 25);
      const contactDesc = totalContacts === 0
        ? "No contacts yet"
        : `${contactsWithTags} of ${totalContacts} contacts have tags`;

      const campaignScore = Math.min(20, campaigns.length * 2);
      const campaignDesc = `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""} executed`;

      const total = deliveryScore + responseScore + contactScore + campaignScore;

      const recommendations: Recommendation[] = [];
      if (deliveryRate < 0.8 && totalMessages > 0) {
        recommendations.push({
          text: "Check phone number validity — low delivery rate may indicate stale contacts.",
          href: "/contacts",
        });
      }
      if (responseRate < 0.1 && totalMessages > 50) {
        recommendations.push({
          text: "Increase engagement by using personalised messages and follow-ups.",
          href: "/campaigns/new",
        });
      }
      if (contactQualityRate < 0.3 && totalContacts > 0) {
        recommendations.push({
          text: "Tag your contacts with lifecycle stage and interest to improve targeting.",
          href: "/contacts",
        });
      }
      if (campaigns.length === 0) {
        recommendations.push({
          text: "Run your first campaign to start building engagement history.",
          href: "/campaigns/new",
        });
      }
      if (responseRate < 0.1 && totalMessages > 50) {
        recommendations.push({
          text: "Set up an auto-reply flow to respond instantly.",
          href: "/flows/new",
        });
      }

      let history: { score: number; recordedAt: string }[] | undefined;
      if (request.query.history === "true") {
        const snapshots = await fastify.prisma.orgTrustScoreSnapshot.findMany({
          where: { organizationId },
          orderBy: { recordedAt: "asc" },
          take: 90,
          select: { score: true, recordedAt: true },
        });
        history = snapshots.map((s) => ({ score: s.score, recordedAt: s.recordedAt.toISOString() }));
      }

      return reply.send({
        data: {
          score: total,
          breakdown: [
            { category: "Delivery Rate",     score: deliveryScore,  maxScore: 30, description: deliveryDesc },
            { category: "Response Rate",     score: responseScore,  maxScore: 25, description: responseDesc },
            { category: "Contact Quality",   score: contactScore,   maxScore: 25, description: contactDesc },
            { category: "Campaign Activity", score: campaignScore,  maxScore: 20, description: campaignDesc },
          ],
          recommendations,
          ...(history !== undefined ? { history } : {}),
        },
      });
    });

    fastify.get<{ Params: { id: ContactId } }>("/contacts/:id/trust-score", async (request, reply) => {
      const { organizationId } = request.auth;

      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!contact) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }

      const messages = await fastify.prisma.message.findMany({
        where: { organizationId, conversation: { contactId: contact.id } },
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

- [ ] **Step 2: Run tests — confirm they pass**

  ```powershell
  pnpm --filter @WBMSG/api exec vitest run src/routes/trust-score.test.ts
  ```

  Expected: All tests pass.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/api/src/routes/trust-score.ts apps/api/src/routes/trust-score.test.ts
  git commit -m "feat(trust-score): add history param and actionable recommendations"
  ```

---

## Task 4: Worker Tests (write failing)

**Files:**
- Create: `apps/api/src/workers/trust-score.test.ts`

- [ ] **Step 1: Create the test file**

  ```typescript
  // apps/api/src/workers/trust-score.test.ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  const mockCreate = vi.fn().mockResolvedValue({});
  const mockFindFirst = vi.fn().mockResolvedValue(null); // no existing snapshot by default
  const mockOrgFindMany = vi.fn().mockResolvedValue([{ id: "org-1" }]);
  const mockMessageCount = vi.fn();
  const mockContactCount = vi.fn();
  const mockCampaignFindMany = vi.fn();

  vi.mock("../lib/prisma.js", () => ({
    prisma: {
      organization: { findMany: mockOrgFindMany },
      message: { count: mockMessageCount },
      contact: { count: mockContactCount },
      campaign: { findMany: mockCampaignFindMany },
      orgTrustScoreSnapshot: { findFirst: mockFindFirst, create: mockCreate },
    },
  }));

  vi.mock("../lib/queue.js", () => ({
    redisConnection: {},
  }));

  vi.mock("bullmq", () => ({
    Queue: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      add: vi.fn(),
    })),
    Worker: vi.fn().mockImplementation((_name: string, processor: () => Promise<void>) => ({
      on: vi.fn(),
      _processor: processor,
    })),
  }));

  describe("computeOrgScore", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("computes score as sum of 4 category scores", async () => {
      mockMessageCount
        .mockResolvedValueOnce(100)  // totalMessages (outbound)
        .mockResolvedValueOnce(80)   // deliveredMessages
        .mockResolvedValueOnce(15);  // inboundMessages
      mockContactCount
        .mockResolvedValueOnce(40)   // totalContacts
        .mockResolvedValueOnce(30);  // contactsWithTags
      mockCampaignFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);

      const { computeOrgScore } = await import("./trust-score.js");
      const result = await computeOrgScore("org-1");

      // deliveryScore = round(0.8 * 30) = 24
      // responseScore = round(0.15 * 25) = 4
      // contactScore  = round(0.75 * 25) = 19
      // campaignScore = min(20, 3*2) = 6
      // total = 53
      expect(result.score).toBe(53);
      expect(result.breakdown.deliveryScore).toBe(24);
      expect(result.breakdown.responseScore).toBe(4);
      expect(result.breakdown.contactScore).toBe(19);
      expect(result.breakdown.campaignScore).toBe(6);
    });

    it("returns zero score when org has no data", async () => {
      mockMessageCount.mockResolvedValue(0);
      mockContactCount.mockResolvedValue(0);
      mockCampaignFindMany.mockResolvedValue([]);

      const { computeOrgScore } = await import("./trust-score.js");
      const result = await computeOrgScore("org-empty");
      expect(result.score).toBe(0);
    });
  });

  describe("startTrustScoreWorker snapshot logic", () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it("writes a snapshot for an org that has no entry today", async () => {
      mockFindFirst.mockResolvedValue(null); // no existing snapshot
      mockMessageCount.mockResolvedValue(0);
      mockContactCount.mockResolvedValue(0);
      mockCampaignFindMany.mockResolvedValue([]);
      mockOrgFindMany.mockResolvedValue([{ id: "org-1" }]);

      const { startTrustScoreWorker } = await import("./trust-score.js");
      const worker = startTrustScoreWorker() as unknown as { _processor: () => Promise<void> };
      await worker._processor();

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: "org-1", score: 0 }),
        })
      );
    });

    it("skips snapshot when one already exists for today", async () => {
      mockFindFirst.mockResolvedValue({ id: "snap-1" }); // already exists
      mockOrgFindMany.mockResolvedValue([{ id: "org-1" }]);

      const { startTrustScoreWorker } = await import("./trust-score.js");
      const worker = startTrustScoreWorker() as unknown as { _processor: () => Promise<void> };
      await worker._processor();

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```powershell
  pnpm --filter @WBMSG/api exec vitest run src/workers/trust-score.test.ts
  ```

  Expected: Fail — module `./trust-score.js` not found.

---

## Task 5: Worker Implementation + Registration

**Files:**
- Create: `apps/api/src/workers/trust-score.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/workers/trust-score.ts`**

  ```typescript
  import { Queue, Worker } from "bullmq";
  import { prisma } from "../lib/prisma.js";
  import { redisConnection } from "../lib/queue.js";

  export const trustScoreQueue = new Queue("trust-score", { connection: redisConnection });
  trustScoreQueue.on("error", (err) => console.error(`[trust-score] queue error: ${err.message}`));

  export async function computeOrgScore(organizationId: string): Promise<{
    score: number;
    breakdown: { deliveryScore: number; responseScore: number; contactScore: number; campaignScore: number };
  }> {
    const [totalMessages, deliveredMessages, inboundMessages, totalContacts, contactsWithTags, campaigns] =
      await Promise.all([
        prisma.message.count({ where: { organizationId, direction: "outbound" } }),
        prisma.message.count({ where: { organizationId, direction: "outbound", status: "delivered" } }),
        prisma.message.count({ where: { organizationId, direction: "inbound" } }),
        prisma.contact.count({ where: { organizationId, deletedAt: null } }),
        prisma.contact.count({ where: { organizationId, deletedAt: null, tags: { isEmpty: false } } }),
        prisma.campaign.findMany({
          where: { organizationId, status: "completed" },
          select: { id: true },
          take: 50,
        }),
      ]);

    const deliveryRate = totalMessages > 0 ? deliveredMessages / totalMessages : 0;
    const deliveryScore = Math.round(deliveryRate * 30);

    const responseRate = totalMessages > 0 ? Math.min(1, inboundMessages / totalMessages) : 0;
    const responseScore = Math.round(responseRate * 25);

    const contactQualityRate = totalContacts > 0 ? contactsWithTags / totalContacts : 0;
    const contactScore = Math.round(contactQualityRate * 25);

    const campaignScore = Math.min(20, campaigns.length * 2);

    return {
      score: deliveryScore + responseScore + contactScore + campaignScore,
      breakdown: { deliveryScore, responseScore, contactScore, campaignScore },
    };
  }

  export function startTrustScoreWorker() {
    const worker = new Worker(
      "trust-score",
      async () => {
        const orgs = await prisma.organization.findMany({ select: { id: true } });
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        for (const org of orgs) {
          const existing = await prisma.orgTrustScoreSnapshot.findFirst({
            where: { organizationId: org.id, recordedAt: { gte: todayStart } },
          });
          if (existing) continue;

          const { score, breakdown } = await computeOrgScore(org.id);
          await prisma.orgTrustScoreSnapshot.create({
            data: { organizationId: org.id, score, breakdown },
          });
          console.log(`[trust-score] org=${org.id} score=${score}`);
        }
      },
      { connection: redisConnection }
    );
    worker.on("error", (err) => console.error(`[trust-score] worker error: ${err.message}`));
    return worker;
  }

  export async function scheduleTrustScoreCron(): Promise<void> {
    await trustScoreQueue.add(
      "daily-snapshot",
      {},
      {
        repeat: { pattern: "0 2 * * *" },
        jobId: "trust-score-cron",
      }
    );
  }
  ```

- [ ] **Step 2: Run worker tests — confirm they pass**

  ```powershell
  pnpm --filter @WBMSG/api exec vitest run src/workers/trust-score.test.ts
  ```

  Expected: All tests pass.

- [ ] **Step 3: Register worker in `apps/api/src/index.ts`**

  Add after the existing worker imports (line 21, after `import "./workers/resume-flow.worker.js";`):

  ```typescript
  import { startTrustScoreWorker, scheduleTrustScoreCron } from "./workers/trust-score.js";
  ```

  Add after `startMessageCleanupWorker()` call (after line 56):

  ```typescript
  startTrustScoreWorker();
  scheduleTrustScoreCron().catch((err) => server.log.warn({ err }, "Trust score cron schedule failed"));
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/src/workers/trust-score.ts apps/api/src/workers/trust-score.test.ts apps/api/src/index.ts
  git commit -m "feat(trust-score): add daily snapshot worker and cron"
  ```

---

## Task 6: TrustTrendChart Component

**Files:**
- Create: `apps/web/components/trust-score/TrustTrendChart.tsx`

- [ ] **Step 1: Create `apps/web/components/trust-score/TrustTrendChart.tsx`**

  ```typescript
  "use client";

  import { JSX } from "react";

  interface Point { score: number; recordedAt: string }

  interface Props {
    history: Point[];
  }

  function getLineColor(lastScore: number): string {
    if (lastScore >= 80) return "#22c55e";
    if (lastScore >= 60) return "#eab308";
    return "#ef4444";
  }

  export function TrustTrendChart({ history }: Props): JSX.Element {
    if (history.length < 2) {
      return (
        <div className="bg-white border rounded-xl p-6 shadow-sm flex items-center justify-center h-32">
          <p className="text-sm text-gray-400">Not enough history yet — check back tomorrow.</p>
        </div>
      );
    }

    const W = 600;
    const H = 120;
    const PAD = { top: 12, right: 12, bottom: 20, left: 28 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const scores = history.map((p) => p.score);
    const rawMin = Math.min(...scores);
    const rawMax = Math.max(...scores);
    const minScore = Math.max(0, rawMin - 5);
    const maxScore = Math.min(100, rawMax + 5);
    const scoreRange = maxScore - minScore || 1;

    function xPos(i: number): number {
      return PAD.left + (i / (history.length - 1)) * innerW;
    }
    function yPos(score: number): number {
      return PAD.top + innerH - ((score - minScore) / scoreRange) * innerH;
    }

    const polylinePoints = history.map((p, i) => `${xPos(i)},${yPos(p.score)}`).join(" ");
    const lastScore = history[history.length - 1]!.score;
    const color = getLineColor(lastScore);

    const firstLabel = new Date(history[0]!.recordedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short",
    });
    const lastLabel = new Date(history[history.length - 1]!.recordedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "short",
    });

    return (
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Score Trend</h2>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left} y1={yPos(v)} x2={W - PAD.right} y2={yPos(v)}
                stroke="#f3f4f6" strokeWidth={1}
              />
              <text x={PAD.left - 4} y={yPos(v) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{v}</text>
            </g>
          ))}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {history.map((p, i) => (
            <circle key={i} cx={xPos(i)} cy={yPos(p.score)} r={2.5} fill={color} />
          ))}
          <text x={PAD.left} y={H - 4} textAnchor="start" fontSize={9} fill="#9ca3af">{firstLabel}</text>
          <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize={9} fill="#9ca3af">{lastLabel}</text>
        </svg>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/web/components/trust-score/TrustTrendChart.tsx
  git commit -m "feat(trust-score): add TrustTrendChart SVG component"
  ```

---

## Task 7: Update Trust Score Page (trend chart + actionable recs)

**Files:**
- Modify: `apps/web/app/(dashboard)/trust-score/page.tsx`

- [ ] **Step 1: Replace the full contents of `apps/web/app/(dashboard)/trust-score/page.tsx`**

  ```typescript
  "use client";

  import { JSX, useEffect, useState } from "react";
  import { useAuth } from "@clerk/nextjs";
  import Link from "next/link";
  import { TrustTrendChart } from "@/components/trust-score/TrustTrendChart";

  const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  interface Recommendation {
    text: string;
    href: string;
  }

  interface HistoryPoint {
    score: number;
    recordedAt: string;
  }

  interface TrustScoreData {
    score: number;
    breakdown: { category: string; score: number; maxScore: number; description: string }[];
    recommendations: Recommendation[];
    history?: HistoryPoint[];
  }

  function getScoreColor(score: number): string {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  }

  function getGaugeRingColor(score: number): string {
    if (score >= 80) return "stroke-green-500";
    if (score >= 60) return "stroke-yellow-400";
    return "stroke-red-500";
  }

  function getGradeText(score: number): string {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Attention";
  }

  function getBarColor(score: number, maxScore: number): string {
    const pct = maxScore > 0 ? score / maxScore : 0;
    if (pct >= 0.8) return "bg-green-500";
    if (pct >= 0.6) return "bg-yellow-400";
    return "bg-red-500";
  }

  function ScoreGauge({ score }: { score: number }): JSX.Element {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const clampedScore = Math.max(0, Math.min(100, score));
    const dashOffset = circumference * (1 - clampedScore / 100);

    return (
      <div className="relative flex items-center justify-center w-40 h-40">
        <svg className="absolute inset-0 -rotate-90" width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle
            cx="80" cy="80" r={radius} fill="none" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            className={getGaugeRingColor(score)}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className={`text-4xl font-bold leading-none ${getScoreColor(score)}`}>
            {Math.round(clampedScore)}
          </span>
          <span className="text-xs text-gray-400 mt-1">out of 100</span>
        </div>
      </div>
    );
  }

  function BreakdownRow({
    category, score, maxScore, description,
  }: { category: string; score: number; maxScore: number; description: string }): JSX.Element {
    const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">{category}</span>
          <span className="text-gray-500 tabular-nums">{score}/{maxScore}</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${getBarColor(score, maxScore)}`}
            style={{ width: `${pct}%`, transition: "width 0.5s ease" }}
          />
        </div>
        {description ? <p className="text-xs text-gray-400">{description}</p> : null}
      </div>
    );
  }

  export default function TrustScorePage(): JSX.Element {
    const { getToken } = useAuth();
    const [data, setData] = useState<TrustScoreData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/v1/trust-score?history=true`, {
            headers: { Authorization: `Bearer ${token ?? ""}` },
          });
          if (!res.ok) {
            if (!cancelled) { setError("Trust score data is not available yet."); setLoading(false); }
            return;
          }
          const json = (await res.json()) as { data: TrustScoreData };
          if (!cancelled) { setData(json.data); setLoading(false); }
        } catch {
          if (!cancelled) { setError("Network error loading trust score."); setLoading(false); }
        }
      })();
      return () => { cancelled = true; };
    }, [getToken]);

    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-400">Calculating trust score...</p>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-semibold">Trust Score</h1>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && !data && (
          <p className="text-sm text-gray-400">No trust score data is available yet.</p>
        )}

        {!loading && !error && data && (
          <>
            {/* Trend chart — before the gauge */}
            {data.history && <TrustTrendChart history={data.history} />}

            {/* Score gauge card */}
            <div className="bg-white border rounded-xl p-8 flex flex-col items-center gap-3 shadow-sm">
              <ScoreGauge score={data.score} />
              <p className={`text-lg font-semibold ${getScoreColor(data.score)}`}>
                {getGradeText(data.score)}
              </p>
              <p className="text-sm text-gray-500 text-center">
                Your organisation&apos;s trust score reflects messaging quality, engagement, and compliance.
              </p>
            </div>

            {/* Score Breakdown */}
            {data.breakdown.length > 0 && (
              <div className="bg-white border rounded-xl p-6 shadow-sm space-y-5">
                <h2 className="text-base font-semibold text-gray-800">Score Breakdown</h2>
                {data.breakdown.map((item) => (
                  <BreakdownRow
                    key={item.category}
                    category={item.category}
                    score={item.score}
                    maxScore={item.maxScore}
                    description={item.description}
                  />
                ))}
              </div>
            )}

            {/* Recommendations — actionable */}
            {data.recommendations.length > 0 && (
              <div className="bg-white border rounded-xl p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-800 mb-4">Recommendations</h2>
                <ul className="space-y-3">
                  {data.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 font-bold shrink-0">&rarr;</span>
                        <span>{rec.text}</span>
                      </div>
                      <Link
                        href={rec.href}
                        className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50 transition-colors"
                      >
                        Fix it &rarr;
                      </Link>
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

- [ ] **Step 2: Verify the page renders correctly**

  ```powershell
  pnpm --filter @WBMSG/web dev
  ```

  Navigate to `http://localhost:3000/trust-score`. Confirm:
  - "Score Trend" chart appears (or "Not enough history" placeholder if no snapshots)
  - Breakdown bars render
  - Each recommendation has a "Fix it →" button linking to the correct path

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/app/(dashboard)/trust-score/page.tsx
  git commit -m "feat(trust-score): add trend chart and actionable recommendations to Trust Score page"
  ```

---

## Task 8: ContactTrustBadge Component

**Files:**
- Create: `apps/web/components/trust-score/ContactTrustBadge.tsx`

- [ ] **Step 1: Create `apps/web/components/trust-score/ContactTrustBadge.tsx`**

  ```typescript
  "use client";

  import { JSX, useEffect, useRef, useState } from "react";
  import { useAuth } from "@clerk/nextjs";

  const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  interface Props {
    contactId: string;
    lazy?: boolean;
  }

  interface TrustResult {
    score: number;
    label: string;
  }

  function labelStyle(label: string): { bg: string; text: string; dot: string } {
    if (label === "high")   return { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-500" };
    if (label === "medium") return { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" };
    if (label === "low")    return { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500" };
    return                         { bg: "bg-gray-50",   text: "text-gray-500",   dot: "bg-gray-400" };
  }

  export function ContactTrustBadge({ contactId, lazy = false }: Props): JSX.Element {
    const { getToken } = useAuth();
    const [trust, setTrust] = useState<TrustResult | null>(null);
    const [visible, setVisible] = useState(!lazy);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
      if (!lazy) return;
      const el = ref.current;
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry?.isIntersecting) { setVisible(true); obs.disconnect(); } },
        { threshold: 0 }
      );
      obs.observe(el);
      return () => obs.disconnect();
    }, [lazy]);

    useEffect(() => {
      if (!visible) return;
      let cancelled = false;
      void (async () => {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/contacts/${contactId}/trust-score`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok || cancelled) return;
        const json = await res.json() as { data: TrustResult };
        if (!cancelled) setTrust(json.data);
      })();
      return () => { cancelled = true; };
    }, [visible, contactId, getToken]);

    if (!trust) {
      return <span ref={ref} className="inline-block w-10 h-5 bg-gray-100 rounded-full animate-pulse" />;
    }

    const { bg, text, dot } = labelStyle(trust.label);
    const labelText = trust.label === "very_low"
      ? "Very Low"
      : trust.label.charAt(0).toUpperCase() + trust.label.slice(1);

    return (
      <span
        ref={ref}
        className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold ${bg} ${text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {labelText}
      </span>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/web/components/trust-score/ContactTrustBadge.tsx
  git commit -m "feat(trust-score): add ContactTrustBadge component with lazy IntersectionObserver loading"
  ```

---

## Task 9: Contacts List — Trust Column

**Files:**
- Modify: `apps/web/components/contacts/ContactsClient.tsx`

- [ ] **Step 1: Add import for ContactTrustBadge**

  At the top of `apps/web/components/contacts/ContactsClient.tsx`, after the existing imports, add:

  ```typescript
  import { ContactTrustBadge } from "@/components/trust-score/ContactTrustBadge";
  ```

- [ ] **Step 2: Add Trust column header**

  Find the table header row. After the `<Th field="whatsappOptOut" label="Marketing" />` line, add:

  ```tsx
  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">Trust</th>
  ```

- [ ] **Step 3: Add Trust cell in each row**

  Find the Marketing badge `<td>` (it renders the `whatsappOptOut` badge). After the closing `</td>` of that cell, add:

  ```tsx
  <td className="px-4 py-3.5">
    <ContactTrustBadge contactId={c.id} lazy />
  </td>
  ```

- [ ] **Step 4: Update empty-state colSpan from 10 to 11**

  Find the empty state row:
  ```tsx
  <td colSpan={10} className="px-5 py-16 text-center">
  ```
  Change `colSpan={10}` to `colSpan={11}`.

- [ ] **Step 5: Update expanded-row colSpan from 10 to 11**

  Find the expanded row:
  ```tsx
  <tr key={`${c.id}-exp`} className="border-b border-gray-100 bg-gray-50/40">
    <td colSpan={10} className="px-6 py-4">
  ```
  Change `colSpan={10}` to `colSpan={11}`.

- [ ] **Step 6: Verify contacts list shows Trust column**

  With `pnpm --filter @WBMSG/web dev` running, navigate to `http://localhost:3000/contacts`. Confirm a "Trust" column appears with animated skeleton badges that resolve to High/Medium/Low/Very Low pills.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/components/contacts/ContactsClient.tsx
  git commit -m "feat(trust-score): add Trust column to contacts list with lazy loading"
  ```

---

## Task 10: Contact Detail — Trust Score Section

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/[id]/ContactDetailSidebar.tsx`

- [ ] **Step 1: Add Trust Score query**

  In `ContactDetailSidebar.tsx`, after the existing `useQuery` calls (e.g. after `customFields` query), add:

  ```typescript
  const { data: trustData, isLoading: loadingTrust } = useQuery<{ score: number; label: string } | null>({
    queryKey: ["contact-trust-score", contact.id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contact.id}/trust-score`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.ok ? (await res.json() as { data: { score: number; label: string } }).data : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  ```

- [ ] **Step 2: Add Trust Score section to the sidebar JSX**

  In the returned JSX, after the last `</div>` section (typically after the custom fields or labels section), add:

  ```tsx
  {/* Trust Score */}
  <SectionHeader title="Trust Score" />
  <div className="pb-4">
    {loadingTrust ? (
      <FieldSkeleton />
    ) : trustData ? (
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-bold tabular-nums ${
          trustData.score >= 80 ? "text-green-600" :
          trustData.score >= 50 ? "text-yellow-500" : "text-red-500"
        }`}>
          {trustData.score}
        </span>
        <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold ${
          trustData.label === "high"     ? "bg-green-50 text-green-700" :
          trustData.label === "medium"   ? "bg-yellow-50 text-yellow-700" :
          trustData.label === "very_low" ? "bg-red-50 text-red-700" :
                                          "bg-red-50 text-red-700"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            trustData.label === "high"   ? "bg-green-500" :
            trustData.label === "medium" ? "bg-yellow-400" : "bg-red-500"
          }`} />
          {trustData.label === "very_low"
            ? "Very Low"
            : trustData.label.charAt(0).toUpperCase() + trustData.label.slice(1)}
        </span>
      </div>
    ) : (
      <span className="text-sm text-gray-400">—</span>
    )}
  </div>
  ```

- [ ] **Step 3: Verify contact detail shows Trust Score**

  Navigate to any contact detail page (`http://localhost:3000/contacts/<id>`). Confirm the sidebar shows a "Trust Score" section with the numeric score and a colour-coded badge.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/app/(dashboard)/contacts/[id]/ContactDetailSidebar.tsx
  git commit -m "feat(trust-score): add Trust Score section to contact detail sidebar"
  ```

---

## Task 11: Inbox — Trust Badge in Conversation Header

**Files:**
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Add import for ContactTrustBadge**

  At the top of `apps/web/app/(dashboard)/inbox/page.tsx`, after the existing imports, add:

  ```typescript
  import { ContactTrustBadge } from "@/components/trust-score/ContactTrustBadge";
  ```

- [ ] **Step 2: Add badge to the conversation header**

  Find the conversation header block (the `{selectedConversation && (` block, lines ~50-71). Inside the `<div className="flex items-center gap-2 min-w-0">` that shows the contact name and status, add the badge after the `<div className="min-w-0">` block:

  ```tsx
  {contact && (
    <ContactTrustBadge contactId={contact.id} />
  )}
  ```

  The full header should look like this after the change:

  ```tsx
  {selectedConversation && (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-green-700">
            {(contactName ?? "?")[0]?.toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contactName ?? contact?.phoneNumber ?? "Unknown"}</p>
          <span className={[
            "text-xs capitalize",
            selectedConversation.status === "open" ? "text-green-600" :
            selectedConversation.status === "pending" ? "text-amber-600" :
            "text-gray-400",
          ].join(" ")}>
            {selectedConversation.status}
          </span>
        </div>
        {contact && (
          <ContactTrustBadge contactId={contact.id} />
        )}
      </div>
    </div>
  )}
  ```

- [ ] **Step 3: Verify badge appears in inbox**

  Navigate to `http://localhost:3000/inbox`. Select a conversation. Confirm a trust badge (e.g. `● High`) appears next to the contact name in the header. If the ML service is not running, the badge stays in the skeleton state and does not show an error.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/app/(dashboard)/inbox/page.tsx
  git commit -m "feat(trust-score): add trust badge to inbox conversation header"
  ```

---

## Self-Review Checklist (for the implementing agent)

Before calling the work done, verify:

- [ ] `pnpm --filter @WBMSG/api exec vitest run src/routes/trust-score.test.ts` — all pass
- [ ] `pnpm --filter @WBMSG/api exec vitest run src/workers/trust-score.test.ts` — all pass
- [ ] `pnpm type-check` — zero new type errors
- [ ] Trust Score page shows trend chart (or placeholder) + gauge + breakdown + "Fix it →" buttons
- [ ] Contacts list has a "Trust" column with lazy badges
- [ ] Contact detail sidebar shows Trust Score section
- [ ] Inbox conversation header shows trust badge when a conversation is selected
- [ ] `apps/api/src/routes/analytics.test.ts` still fails with ECONNRESET (pre-existing — do not fix)
