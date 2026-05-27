# Campaigns Feature — Full Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Campaigns feature to match the "Done" quality bar — fix functional bugs (group targeting, broken executed tab), add missing API endpoints, rebuild the new-campaign flow as a 4-step wizard, polish the list/detail/logs pages.

**Architecture:** API changes are additive (new endpoints + minor fixes to existing ones); worker gets a targeting-mode upgrade; all web pages stay in the existing file structure (no new shared components needed). Tasks 1–5 are API-only, Tasks 6–10 are web-only — they can run in any order after Task 5.

**Tech Stack:** Fastify 4 (API), Prisma (DB), BullMQ (queue worker), Next.js 15 App Router (web), React Query + Clerk auth, Tailwind CSS. All API tests use Vitest + `app.inject()` (no real HTTP). API files use `.js` extensions on imports; web files do NOT.

---

## File Map

| File | Action | Task |
|------|--------|------|
| `apps/api/src/routes/campaigns.ts` | Modify | 1, 2, 3, 4 |
| `apps/api/src/routes/campaigns.test.ts` | Modify | 1, 2, 3 |
| `apps/api/src/workers/campaign.worker.ts` | Modify | 5 |
| `apps/web/app/(dashboard)/campaigns/page.tsx` | Rewrite | 6 |
| `apps/web/app/(dashboard)/campaigns/new/page.tsx` | Rewrite | 7 |
| `apps/web/app/(dashboard)/campaigns/[id]/page.tsx` | Modify | 8 |
| `apps/web/app/(dashboard)/campaigns/[id]/logs/page.tsx` | Rewrite | 9 |
| `apps/web/app/(dashboard)/campaigns/[id]/edit/page.tsx` | Create | 10 |

---

## Task 1: API — Add `GET /campaigns/:id/recipients` endpoint

**Files:**
- Modify: `apps/api/src/routes/campaigns.ts`
- Modify: `apps/api/src/routes/campaigns.test.ts`

The "executed" tab in the logs page calls this endpoint but it doesn't exist, making that tab always broken.

- [ ] **Step 1: Write the failing test**

Open `apps/api/src/routes/campaigns.test.ts` and add this block at the end:

```typescript
describe("GET /v1/campaigns/:id/recipients", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns executed recipients for a campaign", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "cam-1", organizationId: "org-1" });
    mockPrisma.campaignRecipient.findMany.mockResolvedValue([
      {
        id: "r-1", status: "sent", phoneNumber: "911234567890",
        contact: { firstName: "Raj", lastName: "Kumar", phoneNumber: "911234567890" },
      },
    ]);
    mockPrisma.campaignRecipient.count.mockResolvedValue(1);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/cam-1/recipients" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number }>();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(mockPrisma.campaignRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["sent", "delivered", "read", "failed"] } }),
      })
    );
  });

  it("returns 404 when campaign not in org", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/cam-999/recipients" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: FAIL — `GET /v1/campaigns/:id/recipients` resolves to 404 (route not registered).

- [ ] **Step 3: Add the endpoint to `campaigns.ts`**

In `apps/api/src/routes/campaigns.ts`, add this block just before the `// ── Abort` comment (around line 185):

```typescript
  // ── Executed recipients ───────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/recipients",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const [data, total] = await Promise.all([
        fastify.prisma.campaignRecipient.findMany({
          where: { campaignId: request.params.id, status: { in: ["sent", "delivered", "read", "failed"] } },
          include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
          skip: (page - 1) * 50,
          take: 50,
          orderBy: { createdAt: "asc" },
        }),
        fastify.prisma.campaignRecipient.count({
          where: { campaignId: request.params.id, status: { in: ["sent", "delivered", "read", "failed"] } },
        }),
      ]);
      return reply.send({ data, total });
    }
  );
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: All tests PASS including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/routes/campaigns.test.ts
git commit -m "feat(api): add GET /campaigns/:id/recipients endpoint"
```

---

## Task 2: API — Add `DELETE /campaigns/:id` endpoint

**Files:**
- Modify: `apps/api/src/routes/campaigns.ts`
- Modify: `apps/api/src/routes/campaigns.test.ts`

Draft and future-scheduled campaigns should be deletable. The `isDeleteAllowed` helper already exists in campaigns.ts.

- [ ] **Step 1: Write the failing tests**

Add at the end of `apps/api/src/routes/campaigns.test.ts`:

```typescript
describe("DELETE /v1/campaigns/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes a draft campaign and returns 204", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: "cam-1", organizationId: "org-1", status: "draft", scheduledAt: null,
    });
    mockPrisma.campaign.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/campaigns/cam-1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.campaign.delete).toHaveBeenCalledWith({ where: { id: "cam-1" } });
  });

  it("returns 409 when campaign is running", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: "cam-2", organizationId: "org-1", status: "running", scheduledAt: null,
    });
    const res = await app.inject({ method: "DELETE", url: "/v1/campaigns/cam-2" });
    expect(res.statusCode).toBe(409);
    expect(mockPrisma.campaign.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when campaign not in org", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/campaigns/cam-999" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: FAIL — `DELETE /v1/campaigns/:id` returns 404 (route not registered).

- [ ] **Step 3: Add the DELETE endpoint to `campaigns.ts`**

The existing `DELETE /companies/:id` handler at line 76 is in companies.ts — don't confuse them. In `campaigns.ts`, add this block after the `PATCH /campaigns/:id` handler (around line 128, before the `// ── Targeted contact count preview` comment):

```typescript
  fastify.delete<{ Params: { id: CampaignId } }>("/campaigns/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    }
    if (!isDeleteAllowed(campaign.status, campaign.scheduledAt)) {
      return reply.status(409).send({ error: { code: "DELETE_NOT_ALLOWED", message: "Campaign cannot be deleted in its current state" } });
    }
    await fastify.prisma.campaign.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: All tests PASS including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/routes/campaigns.test.ts
git commit -m "feat(api): add DELETE /campaigns/:id for draft/upcoming campaigns"
```

---

## Task 3: API — Add `expired` to report + queue/expired export endpoints

**Files:**
- Modify: `apps/api/src/routes/campaigns.ts`
- Modify: `apps/api/src/routes/campaigns.test.ts`

The detail page needs an `expired` count. WhatsJet provides separate CSV downloads for queue and expired logs.

- [ ] **Step 1: Write the failing test for report expired count**

Add to `campaigns.test.ts`:

```typescript
describe("GET /v1/campaigns/:id/report (with expired)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("includes expired count in stats", async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: "cam-1", organizationId: "org-1" });
    // count is called 6 times: sent, delivered, read, failed, pending, expired
    mockPrisma.campaignRecipient.count
      .mockResolvedValueOnce(10)  // sent
      .mockResolvedValueOnce(8)   // delivered
      .mockResolvedValueOnce(5)   // read
      .mockResolvedValueOnce(2)   // failed
      .mockResolvedValueOnce(3)   // pending
      .mockResolvedValueOnce(1);  // expired
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/cam-1/report" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { stats: { expired: number } } }>();
    expect(body.data.stats.expired).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: FAIL — `body.data.stats.expired` is undefined.

- [ ] **Step 3: Update the report endpoint in `campaigns.ts`**

Find the existing `GET /campaigns/:id/report` handler (around line 260) and update the Promise.all to include expired:

```typescript
  fastify.get<{ Params: { id: string } }>("/campaigns/:id/report", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const [sent, delivered, read, failed, pending, expired] = await Promise.all([
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "sent" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "delivered" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "read" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "failed" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "pending" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "expired" } }),
    ]);
    return reply.send({ data: { campaign, stats: { sent, delivered, read, failed, pending, expired } } });
  });
```

- [ ] **Step 4: Add queue-log-export and expired-log-export endpoints**

Add both after the existing `GET /campaigns/:id/export` handler:

```typescript
  // ── Queue log export ──────────────────────────────────────────────────────
  fastify.get<{ Params: { id: CampaignId } }>(
    "/campaigns/:id/queue-log-export",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      const recipients = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "pending" },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      const header = "Contact Name,Phone Number,Email,Status\n";
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = recipients.map((r) => {
        const name = [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(" ") || "";
        return [escape(name), escape(`="${r.phoneNumber}"`), escape(r.contact?.email ?? ""), r.status].join(",");
      });
      const filename = `campaign-queue-${campaign.name.replace(/\s+/g, "-")}.csv`;
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename=${filename}`);
      return reply.send("﻿" + header + rows.join("\n"));
    }
  );

  // ── Expired log export ────────────────────────────────────────────────────
  fastify.get<{ Params: { id: CampaignId } }>(
    "/campaigns/:id/expired-log-export",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      const recipients = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "expired" },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      const header = "Contact Name,Phone Number,Email,Status\n";
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = recipients.map((r) => {
        const name = [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(" ") || "";
        return [escape(name), escape(`="${r.phoneNumber}"`), escape(r.contact?.email ?? ""), r.status].join(",");
      });
      const filename = `campaign-expired-${campaign.name.replace(/\s+/g, "-")}.csv`;
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename=${filename}`);
      return reply.send("﻿" + header + rows.join("\n"));
    }
  );
```

- [ ] **Step 5: Run all tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/routes/campaigns.test.ts
git commit -m "feat(api): add expired stat to report + queue/expired CSV export endpoints"
```

---

## Task 4: API — Fix group targeting (POST saves groups + schedule accepts optional segmentId)

**Files:**
- Modify: `apps/api/src/routes/campaigns.ts`

Currently `POST /campaigns` ignores the `contactGroup` field and never writes to `campaign_groups`. The `POST /campaigns/:id/schedule` endpoint requires `segmentId` but groups/all-contacts modes don't have one.

- [ ] **Step 1: Update POST /campaigns to persist groupIds**

Find the `POST /campaigns` handler. After the `campaign = await fastify.prisma.campaign.create(...)` call, add the group persistence (full handler shown):

```typescript
  fastify.post<{ Body: CampaignBody }>("/campaigns", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_campaigns")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "manage_campaigns permission required" } });
    }
    const limitCheck = await checkPlanLimit(fastify.prisma, organizationId, "campaigns");
    if (!limitCheck.allowed) {
      return reply.status(402).send({ error: { code: "PLAN_LIMIT_REACHED", message: `Campaign limit of ${limitCheck.limit} reached` } });
    }
    const { name, templateId, textBody, campaignType, scheduledAt, messageInterval } = request.body;
    const resolvedTemplateId = campaignType === "text" || campaignType === "non_template"
      ? (textBody ?? null)
      : (templateId ?? null);
    const campaign = await fastify.prisma.campaign.create({
      data: {
        organizationId,
        name,
        templateId: resolvedTemplateId,
        campaignType: campaignType ?? "template",
        status: "draft" as CampaignStatus,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        messageInterval: messageInterval ?? null,
      },
    });

    // Persist group associations
    const groupIds = normalizeGroupIds(request.body.contactGroup);
    if (groupIds.length > 0) {
      await fastify.prisma.campaignGroup.createMany({
        data: groupIds.map((contactGroupId) => ({ campaignId: campaign.id, contactGroupId })),
        skipDuplicates: true,
      });
    }

    return reply.status(201).send({ data: campaign });
  });
```

- [ ] **Step 2: Make segmentId optional in the schedule endpoint**

Find `POST /campaigns/:id/schedule`. Change its Body type and logic so segmentId is optional. Replace the handler:

```typescript
  fastify.post<{ Params: { id: CampaignId }; Body: { scheduledAt?: string; segmentId?: SegmentId; groupIds?: string[] } }>(
    "/campaigns/:id/schedule",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!campaign) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      }

      const scheduledAt = request.body.scheduledAt ? new Date(request.body.scheduledAt) : new Date();
      const delay = Math.max(0, scheduledAt.getTime() - Date.now());

      // Persist any groupIds passed at schedule time (if not already saved on create)
      const groupIds = normalizeGroupIds(request.body.groupIds);
      if (groupIds.length > 0) {
        await fastify.prisma.campaignGroup.createMany({
          data: groupIds.map((contactGroupId) => ({ campaignId: campaign.id, contactGroupId })),
          skipDuplicates: true,
        });
      }

      await campaignQueue.add(
        "send-campaign",
        { campaignId: campaign.id, organizationId, segmentId: request.body.segmentId },
        { delay }
      );

      const updated = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "scheduled" as CampaignStatus, scheduledAt },
      });

      return reply.send({ data: updated });
    }
  );
```

- [ ] **Step 3: Run existing tests to make sure nothing regressed**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose campaigns.test.ts
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/campaigns.ts
git commit -m "fix(api): persist campaign groups on create; make schedule segmentId optional"
```

---

## Task 5: Worker — Handle group/all-contacts targeting

**Files:**
- Modify: `apps/api/src/workers/campaign.worker.ts`

The worker currently throws `"Segment not found"` when segmentId is absent. It must now support three targeting modes: segment (existing), groups (read from campaignGroups), all contacts.

- [ ] **Step 1: Update the CampaignJob interface and targeting logic**

Replace the entire file content of `apps/api/src/workers/campaign.worker.ts`:

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { sendTextMessage, sendTemplateMessage } from "../lib/whatsapp.js";
import { buildTemplateComponents, contactBodyVars } from "../lib/template-components.js";
import { evaluateSegment, type FilterRule } from "../lib/segment-evaluator.js";
import { getIo } from "../lib/io-ref.js";

interface CampaignJob {
  campaignId: string;
  organizationId: string;
  segmentId?: string;
  groupIds?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveTemplateVars(
  template: string,
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null }
): string {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber;
  return template
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

async function resolveTargetPhones(
  campaignId: string,
  organizationId: string,
  segmentId?: string,
  groupIds?: string[]
): Promise<string[]> {
  // Mode 1: segment
  if (segmentId) {
    const segment = await prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
    if (!segment) throw new Error(`Segment ${segmentId} not found`);
    const result = await evaluateSegment(prisma, organizationId, segment.filters as unknown as FilterRule[]);
    return result.contacts.map((c) => c.phoneNumber);
  }

  // Mode 2: explicit groupIds from job payload
  const effectiveGroupIds = groupIds && groupIds.length > 0 ? groupIds : null;

  // Mode 3: groups stored on the campaign (set at create/schedule time)
  const storedGroups = effectiveGroupIds
    ? null
    : await prisma.campaignGroup.findMany({ where: { campaignId }, select: { contactGroupId: true } });

  const resolvedGroupIds = effectiveGroupIds ?? storedGroups?.map((g) => g.contactGroupId) ?? [];

  if (resolvedGroupIds.length > 0) {
    const groupContacts = await prisma.groupContact.findMany({
      where: { contactGroupId: { in: resolvedGroupIds } },
      include: { contact: { select: { phoneNumber: true } } },
    });
    return [...new Set(groupContacts.map((gc) => gc.contact.phoneNumber))];
  }

  // Mode 4: all org contacts
  const allContacts = await prisma.contact.findMany({
    where: { organizationId, whatsappOptOut: false },
    select: { phoneNumber: true },
  });
  return allContacts.map((c) => c.phoneNumber);
}

export const campaignWorker = new Worker<CampaignJob>(
  "campaigns",
  async (job) => {
    const { campaignId, organizationId, segmentId, groupIds } = job.data;

    const [campaign, org] = await Promise.all([
      prisma.campaign.findFirst({ where: { id: campaignId }, include: { segments: { take: 1 } } }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { phoneNumberId: true, wabaAccessToken: true } }),
    ]);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

    const phones = await resolveTargetPhones(campaignId, organizationId, segmentId, groupIds);

    const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
    const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";
    const isTemplateCampaign = campaign.campaignType === "template";
    const templateBody = campaign.templateId ?? "";
    const intervalMs = (campaign.messageInterval ?? 1) * 1000;

    type MetaTemplate = { name: string; language: string; metaTemplateId: string | null; components: unknown[] };
    let metaTemplate: MetaTemplate | null = null;
    if (isTemplateCampaign && campaign.templateId) {
      const row = await prisma.template.findUnique({
        where: { id: campaign.templateId },
        select: { name: true, language: true, metaTemplateId: true, components: true },
      });
      if (row) {
        metaTemplate = { ...row, components: (row.components ?? []) as unknown[] };
      }
    }
    const total = phones.length;
    let sent = 0;
    let failed = 0;

    function emitProgress() {
      const io = getIo();
      if (!io) return;
      const percentage = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
      io.to(`org:${organizationId}`).emit("campaign:progress", { campaignId, sent, failed, total, percentage });
    }

    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i]!;
      const current = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (current?.status === "paused" || current?.status === "aborted") {
        getIo()?.to(`org:${organizationId}`).emit("campaign:aborted", { campaignId });
        break;
      }

      let recipient = await prisma.campaignRecipient.findFirst({ where: { campaignId, phoneNumber: phone } });
      if (!recipient) {
        recipient = await prisma.campaignRecipient.create({
          data: { campaignId, organizationId, phoneNumber: phone, status: "pending" },
        });
      }
      if (recipient.status === "sent" || recipient.status === "delivered") { sent++; continue; }

      const contact = await prisma.contact.findFirst({
        where: { organizationId, phoneNumber: phone },
        select: { firstName: true, lastName: true, phoneNumber: true, email: true },
      });

      const body = contact ? resolveTemplateVars(templateBody, contact) : templateBody;

      try {
        let messageId: string;
        if (isTemplateCampaign && metaTemplate?.metaTemplateId) {
          const stored = (metaTemplate.components ?? []) as unknown[];
          const bodyVarCount = (() => {
            const bodyComp = (stored as Array<{ type?: string; text?: string }>).find(
              (c) => c.type?.toUpperCase() === "BODY"
            );
            return bodyComp?.text ? (bodyComp.text.match(/\{\{\d+\}\}/g) ?? []).length : 0;
          })();
          const bodyVars = contact ? contactBodyVars(contact, bodyVarCount) : [];
          const components = buildTemplateComponents(stored, { body: bodyVars });
          ({ messageId } = await sendTemplateMessage(
            phoneNumberId, phone, metaTemplate.name, metaTemplate.language, components, accessToken
          ));
        } else {
          ({ messageId } = await sendTextMessage(phoneNumberId, phone, body, accessToken));
        }
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "sent", sentAt: new Date(), messageId },
        });
        sent++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: "failed", errorMessage, retries: { increment: 1 } },
        });
        failed++;
      }

      if ((i + 1) % 50 === 0) emitProgress();
      await sleep(intervalMs);
    }

    emitProgress();

    const finalStatus = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (finalStatus?.status === "running") {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "completed", sentAt: new Date() },
      });
      getIo()?.to(`org:${organizationId}`).emit("campaign:completed", { campaignId, sent, failed, total });
    }
  },
  { connection: redisConnection }
);
```

- [ ] **Step 2: Type-check the worker**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/workers/campaign.worker.ts
git commit -m "fix(worker): support group and all-contacts targeting when no segment"
```

---

## Task 6: Web — Campaign List Page

**Files:**
- Rewrite: `apps/web/app/(dashboard)/campaigns/page.tsx`

Replace the active/archived tabs with a full status filter, use `displayStatus` for badges, and add a delete button for eligible campaigns.

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  displayStatus: string;
  isArchived: boolean;
  deleteAllowed: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
}

type Tab = "all" | "draft" | "upcoming" | "running" | "paused" | "completed" | "aborted" | "archived";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "upcoming", label: "Upcoming" },
  { key: "running", label: "Running" },
  { key: "paused", label: "Paused" },
  { key: "completed", label: "Completed" },
  { key: "aborted", label: "Aborted" },
  { key: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray",
  upcoming: "yellow",
  scheduled: "yellow",
  running: "blue",
  paused: "yellow",
  completed: "green",
  cancelled: "red",
  aborted: "red",
};

export default function CampaignsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>("all");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Campaign[] }).data;
    },
  });

  const filtered = campaigns.filter((c) => {
    if (tab === "archived") return c.isArchived;
    if (tab === "all") return !c.isArchived;
    return c.displayStatus === tab && !c.isArchived;
  });

  async function doAction(id: string, action: string) {
    const token = await getToken();
    await fetch(`${API_URL}/v1/campaigns/${id}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const token = await getToken();
    await fetch(`${API_URL}/v1/campaigns/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  }

  return (
    <WhatsAppGate feature="Campaigns">
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Campaigns</h1>
              <p className="text-sm text-gray-500 mt-0.5">{campaigns.filter(c => !c.isArchived).length} active</p>
            </div>
            <Link href="/campaigns/new"><Button>New Campaign</Button></Link>
          </div>

          {/* Status tabs */}
          <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                  tab === t.key
                    ? "text-brand-600 border-b-2 border-brand-600 -mb-px"
                    : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t.label}
                {t.key !== "all" && t.key !== "archived" && (
                  <span className={`ml-1.5 text-xs tabular-nums ${tab === t.key ? "text-brand-500" : "text-gray-400"}`}>
                    {campaigns.filter(c => !c.isArchived && c.displayStatus === t.key).length || ""}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Campaign list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
                  <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">No {tab === "all" ? "" : tab} campaigns</p>
                {tab === "all" && (
                  <Link href="/campaigns/new" className="mt-2 inline-block text-sm text-brand-600 hover:text-brand-700 font-medium">
                    Create your first campaign →
                  </Link>
                )}
              </div>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-4 gap-3 group">
                  <div className="min-w-0">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate block"
                    >
                      {c.name}
                    </Link>
                    {c.scheduledAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_BADGE[c.displayStatus] ?? "gray"}>{c.displayStatus}</Badge>

                    {c.status === "running" && (
                      <button
                        onClick={() => { void doAction(c.id, "abort"); }}
                        className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Abort
                      </button>
                    )}
                    {c.status === "running" && (
                      <button
                        onClick={() => { void doAction(c.id, "pause"); }}
                        className="text-xs text-gray-600 hover:text-gray-700 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        Pause
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button
                        onClick={() => { void doAction(c.id, "resume"); }}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 rounded-md hover:bg-brand-50 transition-colors"
                      >
                        Resume
                      </button>
                    )}
                    {(c.status === "completed" || c.status === "aborted") && !c.isArchived && (
                      <button
                        onClick={() => { void doAction(c.id, "archive"); }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        Archive
                      </button>
                    )}
                    {c.isArchived && (
                      <button
                        onClick={() => { void doAction(c.id, "unarchive"); }}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 rounded-md hover:bg-brand-50 transition-colors"
                      >
                        Unarchive
                      </button>
                    )}
                    {c.deleteAllowed && (
                      <button
                        onClick={() => { void handleDelete(c.id, c.name); }}
                        className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                        title="Delete campaign"
                      >
                        Delete
                      </button>
                    )}
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-xs text-gray-400 hover:text-gray-600 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </WhatsAppGate>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/page.tsx
git commit -m "feat(web): campaign list — status tabs, displayStatus badge, delete-draft action"
```

---

## Task 7: Web — New Campaign Wizard (4-step)

**Files:**
- Rewrite: `apps/web/app/(dashboard)/campaigns/new/page.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { WhatsAppGate } from "@/components/WhatsAppGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Template { id: string; name: string; bodyText: string | null; language: string; status: string }
interface Group { id: string; title: string; _count: { contacts: number } }
interface Segment { id: string; name: string }

type CampaignType = "template" | "non_template";
type AudienceMode = "all" | "groups" | "segment";
type ScheduleMode = "now" | "later";

const STEPS = ["Details", "Message", "Audience", "Launch"] as const;

export default function NewCampaignPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const { toast, toastState, setToastOpen } = useToast();

  // Step state
  const [step, setStep] = useState(1);

  // Form state
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("template");
  const [templateId, setTemplateId] = useState("");
  const [freeTextBody, setFreeTextBody] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [messageInterval, setMessageInterval] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Data fetching
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates-for-campaign"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/templates`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: Template[] }).data.filter((t) => t.status === "approved");
    },
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups-for-campaign"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contact-groups?limit=100`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: Group[] }).data;
    },
  });

  const { data: segments = [] } = useQuery<Segment[]>({
    queryKey: ["segments-for-campaign"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: Segment[] }).data;
    },
  });

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const estimatedCount = audienceMode === "groups"
    ? groups.filter((g) => selectedGroupIds.includes(g.id)).reduce((sum, g) => sum + g._count.contacts, 0)
    : null;

  function canAdvance(): boolean {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return campaignType === "template" ? templateId !== "" : freeTextBody.trim().length > 0;
    if (step === 3) {
      if (audienceMode === "groups") return selectedGroupIds.length > 0;
      if (audienceMode === "segment") return segmentId !== "";
      return true;
    }
    return true;
  }

  async function handleLaunch() {
    setSaving(true);
    try {
      const token = await getToken();

      const createRes = await fetch(`${API_URL}/v1/campaigns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          campaignType,
          templateId: campaignType === "template" ? templateId : undefined,
          textBody: campaignType === "non_template" ? freeTextBody : undefined,
          messageInterval: messageInterval > 0 ? messageInterval : undefined,
          contactGroup: audienceMode === "groups" ? selectedGroupIds : undefined,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json() as { error?: { message?: string } };
        toast(err.error?.message ?? "Failed to create campaign", { variant: "error" });
        setSaving(false);
        return;
      }

      const { data } = await createRes.json() as { data: { id: string } };

      const scheduleRes = await fetch(`${API_URL}/v1/campaigns/${data.id}/schedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId: audienceMode === "segment" ? segmentId : undefined,
          scheduledAt: scheduleMode === "later" && scheduledAt ? scheduledAt : undefined,
        }),
      });

      if (!scheduleRes.ok) {
        const err = await scheduleRes.json() as { error?: { message?: string } };
        toast(err.error?.message ?? "Failed to schedule campaign", { variant: "error" });
        setSaving(false);
        return;
      }

      router.push("/campaigns");
    } catch {
      toast("An unexpected error occurred", { variant: "error" });
      setSaving(false);
    }
  }

  return (
    <WhatsAppGate feature="Campaigns">
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

          {/* Breadcrumb */}
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Campaigns
          </Link>

          {/* Step indicator */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New Campaign</h1>
            <div className="flex items-center gap-2 mt-4">
              {STEPS.map((label, idx) => {
                const n = idx + 1;
                const done = n < step;
                const active = n === step;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${done ? "bg-brand-600 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-gray-200 text-gray-500"}`}>
                      {done ? "✓" : n}
                    </div>
                    <span className={`text-sm font-medium ${active ? "text-brand-600" : done ? "text-gray-600" : "text-gray-400"}`}>{label}</span>
                    {idx < STEPS.length - 1 && <div className={`w-8 h-0.5 ${done ? "bg-brand-400" : "bg-gray-200"}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

            {/* Step 1: Details */}
            {step === 1 && (
              <>
                <Input
                  label="Campaign Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. May Sale Blast"
                  autoFocus
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Campaign Type</label>
                  <div className="flex gap-3">
                    {(["template", "non_template"] as CampaignType[]).map((t) => (
                      <label
                        key={t}
                        className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border cursor-pointer transition-all ${campaignType === t ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <input
                          type="radio"
                          value={t}
                          checked={campaignType === t}
                          onChange={() => setCampaignType(t)}
                          className="accent-brand-600"
                        />
                        <span className="text-sm font-medium text-gray-800">
                          {t === "template" ? "WhatsApp Template" : "Free Text"}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {campaignType === "template"
                      ? "Use pre-approved Meta templates. Required for first-time messaging."
                      : "Send a custom text message. Only works within 24h of last contact reply."}
                  </p>
                </div>
              </>
            )}

            {/* Step 2: Message */}
            {step === 2 && campaignType === "template" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Select Template</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Choose an approved template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                </div>
                {selectedTemplate && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Preview</p>
                    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {selectedTemplate.bodyText ?? "No body text"}
                    </div>
                  </div>
                )}
                {templates.length === 0 && (
                  <p className="text-sm text-gray-400">No approved templates found. <Link href="/templates" className="text-brand-600 hover:underline">Create one →</Link></p>
                )}
              </div>
            )}

            {step === 2 && campaignType === "non_template" && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Message Body</label>
                <textarea
                  value={freeTextBody}
                  onChange={(e) => setFreeTextBody(e.target.value)}
                  rows={5}
                  placeholder="Type your message… Use {{name}}, {{phone}}, {{email}} for personalization."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                <p className="text-xs text-gray-400">{freeTextBody.length} characters</p>
              </div>
            )}

            {/* Step 3: Audience */}
            {step === 3 && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Target Audience</label>
                  <div className="flex gap-2">
                    {(["all", "groups", "segment"] as AudienceMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setAudienceMode(m)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all capitalize ${audienceMode === m ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        {m === "all" ? "All Contacts" : m === "groups" ? "Groups" : "Segment"}
                      </button>
                    ))}
                  </div>
                </div>

                {audienceMode === "groups" && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Select one or more groups:</p>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-3">
                      {groups.length === 0 && <p className="col-span-2 text-sm text-gray-400 text-center py-4">No groups yet</p>}
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={(e) =>
                              setSelectedGroupIds((prev) =>
                                e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                              )
                            }
                            className="rounded accent-brand-600"
                          />
                          <span className="text-sm text-gray-800 truncate">{g.title}</span>
                          <span className="text-xs text-gray-400 ml-auto shrink-0">{g._count.contacts}</span>
                        </label>
                      ))}
                    </div>
                    {estimatedCount !== null && estimatedCount > 0 && (
                      <p className="text-sm font-semibold text-green-700 bg-green-50 rounded-lg px-3 py-2">
                        ~{estimatedCount.toLocaleString()} contacts will receive this campaign
                      </p>
                    )}
                  </div>
                )}

                {audienceMode === "segment" && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Segment</label>
                    <select
                      value={segmentId}
                      onChange={(e) => setSegmentId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select a segment…</option>
                      {segments.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {segments.length === 0 && (
                      <p className="text-xs text-gray-400">No segments yet. <Link href="/contacts/segments" className="text-brand-600 hover:underline">Create one →</Link></p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Message Interval (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={messageInterval}
                    onChange={(e) => setMessageInterval(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400">Delay between each message to avoid rate limiting. 0 = send as fast as possible.</p>
                </div>
              </>
            )}

            {/* Step 4: Schedule & Launch */}
            {step === 4 && (
              <>
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Send Time</label>
                  <div className="flex gap-3">
                    {(["now", "later"] as ScheduleMode[]).map((m) => (
                      <label
                        key={m}
                        className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border cursor-pointer transition-all ${scheduleMode === m ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <input type="radio" value={m} checked={scheduleMode === m} onChange={() => setScheduleMode(m)} className="accent-brand-600" />
                        <span className="text-sm font-medium">{m === "now" ? "Send immediately" : "Schedule for later"}</span>
                      </label>
                    ))}
                  </div>
                  {scheduleMode === "later" && (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  )}
                </div>

                {/* Summary card */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Summary</p>
                  </div>
                  {[
                    { label: "Campaign", value: name },
                    { label: "Type", value: campaignType === "template" ? "WhatsApp Template" : "Free Text" },
                    { label: "Message", value: campaignType === "template" ? (selectedTemplate?.name ?? "—") : `${freeTextBody.slice(0, 60)}…` },
                    { label: "Audience", value: audienceMode === "all" ? "All contacts" : audienceMode === "groups" ? `${selectedGroupIds.length} group(s) · ~${estimatedCount ?? 0} contacts` : segments.find(s => s.id === segmentId)?.name ?? "—" },
                    { label: "Interval", value: messageInterval > 0 ? `${messageInterval}s between messages` : "No delay" },
                    { label: "Sends", value: scheduleMode === "now" ? "Immediately" : scheduledAt ? new Date(scheduledAt).toLocaleString("en-IN") : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start gap-4 px-4 py-2.5 text-sm">
                      <span className="text-gray-400 w-24 shrink-0">{label}</span>
                      <span className="text-gray-900 font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            {step > 1 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>← Back</Button>
            ) : (
              <Link href="/campaigns"><Button variant="secondary">Cancel</Button></Link>
            )}
            {step < 4 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()}>
                Next →
              </Button>
            ) : (
              <Button
                onClick={() => { void handleLaunch(); }}
                disabled={saving || (scheduleMode === "later" && !scheduledAt)}
              >
                {saving ? "Launching…" : "Launch Campaign"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Toast title={toastState.title} variant={toastState.variant} open={toastState.open} onOpenChange={setToastOpen} />
    </WhatsAppGate>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/new/page.tsx
git commit -m "feat(web): replace flat campaign form with 4-step wizard"
```

---

## Task 8: Web — Campaign Detail Page Improvements

**Files:**
- Modify: `apps/web/app/(dashboard)/campaigns/[id]/page.tsx`

Add breadcrumb, logs link, edit button, expired stat, delivery/read rates, template info.

- [ ] **Step 1: Replace the file**

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getSocket } from "@/lib/socket";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  displayStatus: string;
  isArchived: boolean;
  scheduledAt: string | null;
  sentAt: string | null;
  campaignType: string;
  messageInterval: number | null;
  templateId: string | null;
}

interface Stats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  expired: number;
}

interface Progress {
  sent: number;
  failed: number;
  total: number;
  percentage: number;
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray", upcoming: "yellow", scheduled: "yellow", running: "blue", paused: "yellow",
  completed: "green", cancelled: "red", aborted: "red",
};

export default function CampaignDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [acting, setActing] = useState(false);

  const { data: report } = useQuery<{ campaign: Campaign; stats: Stats }>({
    queryKey: ["campaign-report", id],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}/report`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed");
      return (await res.json() as { data: { campaign: Campaign; stats: Stats } }).data;
    },
    refetchInterval: (query) => query.state.data?.campaign.status === "running" ? 10000 : false,
  });

  const { data: templateData } = useQuery<{ name: string } | null>({
    queryKey: ["template-info", report?.campaign.templateId],
    queryFn: async () => {
      if (!report?.campaign.templateId || report.campaign.campaignType !== "template") return null;
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/templates/${report.campaign.templateId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return null;
      return (await res.json() as { data: { name: string } }).data;
    },
    enabled: !!report && report.campaign.campaignType === "template" && !!report.campaign.templateId,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    function onProgress(data: Progress & { campaignId: string }) {
      if (data.campaignId === id) setProgress(data);
    }
    function onCompleted(data: { campaignId: string }) {
      if (data.campaignId === id) {
        void queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
        void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      }
    }

    socket.on("campaign:progress", onProgress);
    socket.on("campaign:completed", onCompleted);
    socket.on("campaign:aborted", onCompleted);
    return () => {
      socket.off("campaign:progress", onProgress);
      socket.off("campaign:completed", onCompleted);
      socket.off("campaign:aborted", onCompleted);
    };
  }, [id, queryClient]);

  async function doAction(action: string) {
    setActing(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/campaigns/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } finally {
      setActing(false);
    }
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const { campaign, stats } = report;
  const liveProgress = progress ?? {
    sent: stats.sent,
    failed: stats.failed,
    total: stats.sent + stats.delivered + stats.read + stats.failed + stats.pending + stats.expired,
    percentage: 0,
  };
  const livePercentage = liveProgress.total > 0
    ? Math.round(((liveProgress.sent + liveProgress.failed) / liveProgress.total) * 100)
    : (campaign.status === "completed" ? 100 : 0);

  const deliveryRate = stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0;
  const readRate = stats.delivered > 0 ? Math.round((stats.read / stats.delivered) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Breadcrumb */}
        <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Campaigns
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{campaign.name}</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <Badge variant={statusVariant[campaign.displayStatus ?? campaign.status] ?? "gray"}>
                {campaign.displayStatus ?? campaign.status}
              </Badge>
              {templateData && (
                <span className="text-sm text-gray-500">Template: <span className="text-gray-800 font-medium">{templateData.name}</span></span>
              )}
              {campaign.messageInterval ? (
                <span className="text-xs text-gray-400">{campaign.messageInterval}s interval</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <Link href={`/campaigns/${id}/logs`}>
              <Button variant="secondary" size="sm">View Logs</Button>
            </Link>
            {campaign.status === "draft" && (
              <Link href={`/campaigns/${id}/edit`}>
                <Button variant="secondary" size="sm">Edit</Button>
              </Link>
            )}
            {campaign.status === "running" && (
              <Button variant="secondary" size="sm" onClick={() => { void doAction("pause"); }} disabled={acting}>Pause</Button>
            )}
            {campaign.status === "paused" && (
              <Button size="sm" onClick={() => { void doAction("resume"); }} disabled={acting}>Resume</Button>
            )}
            {campaign.status === "running" && (
              <Button variant="destructive" size="sm" onClick={() => { void doAction("abort"); }} disabled={acting}>Abort</Button>
            )}
            {!campaign.isArchived && (campaign.status === "completed" || campaign.status === "aborted") && (
              <Button variant="secondary" size="sm" onClick={() => { void doAction("archive"); }} disabled={acting}>Archive</Button>
            )}
            {campaign.isArchived && (
              <Button variant="secondary" size="sm" onClick={() => { void doAction("unarchive"); }} disabled={acting}>Unarchive</Button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {(campaign.status === "running" || campaign.status === "completed" || campaign.status === "aborted") && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-700">Progress</span>
              <span className="font-bold text-gray-900">{livePercentage}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${campaign.status === "aborted" ? "bg-red-500" : "bg-brand-600"}`}
                style={{ width: `${livePercentage}%` }}
              />
            </div>
            <div className="flex gap-5 text-xs text-gray-500">
              <span><span className="font-semibold text-green-600">{liveProgress.sent}</span> sent</span>
              <span><span className="font-semibold text-red-500">{liveProgress.failed}</span> failed</span>
              <span><span className="font-semibold text-gray-700">{liveProgress.total}</span> total</span>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {([
            { label: "Sent", value: stats.sent, color: "text-gray-900" },
            { label: "Delivered", value: stats.delivered, color: "text-blue-600" },
            { label: "Read", value: stats.read, color: "text-green-600" },
            { label: "Failed", value: stats.failed, color: "text-red-600" },
            { label: "Pending", value: stats.pending, color: "text-yellow-600" },
            { label: "Expired", value: stats.expired, color: "text-gray-400" },
          ] as const).map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-400 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Rates */}
        {(stats.sent > 0 || stats.delivered > 0) && (
          <div className="flex gap-6 bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-sm">
            <div>
              <span className="text-gray-400">Delivery rate</span>
              <span className="ml-2 font-semibold text-gray-900">{deliveryRate}%</span>
            </div>
            <div className="w-px bg-gray-100" />
            <div>
              <span className="text-gray-400">Read rate</span>
              <span className="ml-2 font-semibold text-gray-900">{readRate}%</span>
            </div>
          </div>
        )}

        {/* Requeue */}
        {stats.failed > 0 && campaign.status !== "running" && (
          <Button variant="secondary" size="sm" onClick={() => { void doAction("requeue-failed"); }} disabled={acting}>
            Requeue {stats.failed} failed {stats.failed === 1 ? "recipient" : "recipients"}
          </Button>
        )}

        {/* Timestamps */}
        <div className="text-xs text-gray-400 space-y-1">
          {campaign.scheduledAt && <p>Scheduled: {new Date(campaign.scheduledAt).toLocaleString("en-IN")}</p>}
          {campaign.sentAt && <p>Sent: {new Date(campaign.sentAt).toLocaleString("en-IN")}</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/\[id\]/page.tsx
git commit -m "feat(web): campaign detail — breadcrumb, logs link, expired stat, delivery rates"
```

---

## Task 9: Web — Campaign Logs Page

**Files:**
- Rewrite: `apps/web/app/(dashboard)/campaigns/[id]/logs/page.tsx`

Fix the broken executed tab, add pagination, loading skeletons, per-tab export links, and polish to Done quality.

- [ ] **Step 1: Replace the file**

```typescript
"use client";

import { JSX, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

type LogTab = "queue" | "executed" | "expired";

interface Recipient {
  id: string;
  status: string;
  phoneNumber: string;
  sentAt?: string | null;
  errorMessage?: string | null;
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string } | null;
}

const STATUS_BADGE: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  pending: "yellow",
  sent: "blue",
  delivered: "green",
  read: "green",
  failed: "red",
  expired: "gray",
};

const TAB_LABELS: Record<LogTab, string> = { queue: "Queue", executed: "Executed", expired: "Expired" };

const EXPORT_PATHS: Record<LogTab, string> = {
  queue: "queue-log-export",
  executed: "export",
  expired: "expired-log-export",
};

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function SkeletonRows(): JSX.Element {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
        </div>
      ))}
    </>
  );
}

export default function CampaignLogsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<LogTab>("queue");
  const [pages, setPages] = useState<Record<LogTab, number>>({ queue: 1, executed: 1, expired: 1 });

  const page = pages[tab];

  const ENDPOINTS: Record<LogTab, string> = {
    queue: `/api/v1/campaigns/${id}/queue-log?page=${page}`,
    executed: `/api/v1/campaigns/${id}/recipients?page=${page}`,
    expired: `/api/v1/campaigns/${id}/expired-log?page=${page}`,
  };

  const { data, isLoading, isFetching } = useQuery<{ data: Recipient[]; total?: number }>({
    queryKey: ["campaign-log", id, tab, page],
    queryFn: () => fetch(ENDPOINTS[tab]).then((r) => r.json()),
  });

  const recipients = data?.data ?? [];
  const total = data?.total ?? recipients.length;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const loading = isLoading || isFetching;

  function setPage(n: number) {
    setPages((prev) => ({ ...prev, [tab]: n }));
  }

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

        {/* Breadcrumb */}
        <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Campaign
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Campaign Logs</h1>
          <a
            href={`/api/v1/campaigns/${id}/${EXPORT_PATHS[tab]}`}
            className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
            download
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download {TAB_LABELS[tab]} CSV
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-gray-200">
          {(Object.keys(TAB_LABELS) as LogTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t ? "text-brand-600 border-b-2 border-brand-600 -mb-px" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <SkeletonRows />
          ) : recipients.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </div>
              <p className="text-gray-500 font-medium">No records in {TAB_LABELS[tab].toLowerCase()} log</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recipients.map((r) => {
                const displayName = r.contact
                  ? [r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || r.phoneNumber
                  : r.phoneNumber;
                const initials = displayName.slice(0, 2).toUpperCase();
                return (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">+{r.contact?.phoneNumber ?? r.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {r.sentAt && (
                        <span className="text-xs text-gray-400 hidden sm:block">
                          {new Date(r.sentAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      )}
                      <Badge variant={STATUS_BADGE[r.status] ?? "gray"}>{r.status}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
              <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/\[id\]/logs/page.tsx
git commit -m "feat(web): campaign logs — fix executed tab, pagination, skeletons, export buttons"
```

---

## Task 10: Web — Edit Draft Campaign Page

**Files:**
- Create: `apps/web/app/(dashboard)/campaigns/[id]/edit/page.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  campaignType: string;
  templateId: string | null;
  status: string;
}

export default function EditCampaignPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const { toast, toastState, setToastOpen } = useToast();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [name, setName] = useState("");
  const [freeTextBody, setFreeTextBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) { setLoading(false); return; }
      const data = (await res.json() as { data: Campaign }).data;
      setCampaign(data);
      setName(data.name);
      if (data.campaignType !== "template") setFreeTextBody(data.templateId ?? "");
      setLoading(false);
    }
    void load();
  }, [id, getToken]);

  async function handleSave() {
    if (!campaign) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(campaign.campaignType !== "template" ? { textBody: freeTextBody, campaignType: campaign.campaignType } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } };
        toast(err.error?.message ?? "Failed to save", { variant: "error" });
        return;
      }
      router.push(`/campaigns/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!campaign || campaign.status !== "draft") {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <p className="text-gray-500">This campaign cannot be edited.</p>
        <Link href="/campaigns" className="mt-3 inline-block text-sm text-brand-600 hover:underline">← Back to Campaigns</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-lg mx-auto px-6 py-6 space-y-6">

        <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Campaign
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Edit Campaign</h1>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <Input
            label="Campaign Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {campaign.campaignType !== "template" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Message Body</label>
              <textarea
                value={freeTextBody}
                onChange={(e) => setFreeTextBody(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          )}

          {campaign.campaignType === "template" && (
            <p className="text-sm text-gray-400">Template campaigns use the template selected at creation. To change the template, create a new campaign.</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button onClick={() => { void handleSave(); }} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
          <Link href={`/campaigns/${id}`}>
            <Button variant="secondary">Cancel</Button>
          </Link>
        </div>
      </div>

      <Toast title={toastState.title} variant={toastState.variant} open={toastState.open} onOpenChange={setToastOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Run all API tests one final time**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/\[id\]/edit/page.tsx
git commit -m "feat(web): add edit-draft campaign page"
```

---

## Final Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] Campaign list shows correct tabs and `displayStatus` badge (not raw "scheduled")
- [ ] Delete button appears for draft campaigns and calls DELETE endpoint
- [ ] New campaign wizard advances through 4 steps with validation; groups are selectable; schedule "later" shows datetime picker
- [ ] Campaign detail shows ← back link, "View Logs" button, expired stat, delivery/read rates
- [ ] "Edit" button visible for draft campaigns, links to edit page
- [ ] Campaign logs "executed" tab loads (not 404)
- [ ] Queue/expired tabs have export download links
- [ ] Logs page shows pagination when >50 records
- [ ] Type-check passes: `pnpm type-check`
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
