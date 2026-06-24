# Basic Automation (OOO + Welcome + Delayed Response) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three time/event-aware automation features — Out of Office (OOO), Welcome Message, and Delayed Response — plus the Business Hours config they share. All live in the Flows page. Triggered from the inbound message worker via a new `automation-trigger.ts` helper.

**Architecture:** New Prisma models (`BusinessHours`, `OrgAutomationSettings`) → new API router (`automation-settings.ts`) → new `automation-trigger.ts` helper called inside `inbound-message.worker.ts` → new BullMQ `delayed-response` queue + worker → four new React cards rendered at the bottom of the Flows page.

**Tech Stack:** Fastify 4, Node.js 24, TypeScript strict, Prisma 7 + PostgreSQL 16, BullMQ + Redis, Next.js 15 App Router, Tailwind CSS

---

## Global Constraints

- All API imports use `.js` extension (ESM-only)
- TypeScript strict — no `any`, no implicit returns
- No `console.log` — use Fastify's `request.log` in route handlers; worker logs must use `job.log()` or `console.error` only for genuine errors
- All Prisma queries **must** include `organizationId` in `where` clause
- Named exports only
- Test file per source file, co-located in `apps/api/src/routes/` and `apps/api/src/workers/`
- Commit per task, Conventional Commits (`feat(automation): ...`)
- Run `pnpm --filter @WBMSG/api test` and `pnpm type-check` before each commit

---

## Task 1 — DB Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.prisma` (Organization model relations block)
- Create: migration via `npx prisma migrate dev`

### Steps

- [ ] Add the two new models to `apps/api/prisma/schema.prisma`, **before** the closing of the file (after existing models):

```prisma
model BusinessHours {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  dayOfWeek      Int      @map("day_of_week")   // 0=Sun, 1=Mon … 6=Sat
  startTime      String   @map("start_time")    // "HH:MM" 24h
  endTime        String   @map("end_time")      // "HH:MM" 24h
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("business_hours")
}

model OrgAutomationSettings {
  id             String  @id @default(uuid())
  organizationId String  @unique @map("organization_id")

  // Out of Office
  oooEnabled        Boolean @default(false) @map("ooo_enabled")
  oooMessage        String? @map("ooo_message")
  oooMessageData    Json?   @map("ooo_message_data")

  // Welcome Message
  welcomeEnabled          Boolean @default(false) @map("welcome_enabled")
  welcomePersonalized     Boolean @default(false) @map("welcome_personalized")
  welcomeMessage          String? @map("welcome_message")
  welcomeMessageData      Json?   @map("welcome_message_data")
  welcomeNewMessage       String? @map("welcome_new_message")
  welcomeNewData          Json?   @map("welcome_new_data")
  welcomeReturningMessage String? @map("welcome_returning_message")
  welcomeReturningData    Json?   @map("welcome_returning_data")
  welcomeFlowId           String? @map("welcome_flow_id")

  // Delayed Response
  delayedEnabled     Boolean @default(false) @map("delayed_enabled")
  delayedMinutes     Int     @default(30)    @map("delayed_minutes")
  delayedMessage     String? @map("delayed_message")
  delayedMessageData Json?   @map("delayed_message_data")
  delayedSendWithOoo Boolean @default(false) @map("delayed_send_with_ooo")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("org_automation_settings")
}
```

- [ ] Add back-relations to the `Organization` model (inside its model block, alongside existing relation fields):

```prisma
  businessHours           BusinessHours[]
  orgAutomationSettings   OrgAutomationSettings?
```

- [ ] Run migration from repo root:

```bash
npx prisma migrate dev --name add_business_hours_and_automation_settings
```

- [ ] Regenerate client:

```bash
npx prisma generate
```

- [ ] Verify no TypeScript errors: `pnpm type-check`

### Commit

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(automation): add BusinessHours and OrgAutomationSettings schema + migration"
```

---

## Task 2 — `isWithinBusinessHours` Helper + Unit Tests

**Files:**
- Create: `apps/api/src/lib/automation-trigger.ts`
- Create: `apps/api/src/lib/automation-trigger.test.ts`

### Steps

- [ ] Create `apps/api/src/lib/automation-trigger.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";

/**
 * Returns true if `now` falls within any BusinessHours slot for the org.
 * Uses org's timezone stored in `Organization.settings.timezone` (defaults to UTC).
 * Compares local wall-clock time in that timezone against each slot's HH:MM range.
 */
export async function isWithinBusinessHours(
  prisma: PrismaClient,
  organizationId: string,
  now: Date = new Date()
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const timezone = typeof settings["timezone"] === "string" ? settings["timezone"] : "UTC";

  const slots = await prisma.businessHours.findMany({
    where: { organizationId },
  });

  if (slots.length === 0) return false;

  // Get current local HH:MM in the org timezone
  let localHour: number;
  let localMinute: number;
  let localDayOfWeek: number;

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
      timeZone: timezone,
    });
    const parts = formatter.formatToParts(now);
    localHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    localMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    // Get day of week (0=Sun…6=Sat) using a locale-independent approach
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: timezone,
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    localDayOfWeek = dayMap[dayStr] ?? now.getDay();
  } catch {
    // Fallback to UTC if timezone is invalid
    localHour = now.getUTCHours();
    localMinute = now.getUTCMinutes();
    localDayOfWeek = now.getUTCDay();
  }

  const currentMinutes = localHour * 60 + localMinute;

  return slots.some((slot) => {
    if (slot.dayOfWeek !== localDayOfWeek) return false;
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
    const endMinutes = (eh ?? 0) * 60 + (em ?? 0);
    // Normal range (e.g. 09:00–18:00); end-midnight is handled as exclusive
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  });
}
```

- [ ] Create `apps/api/src/lib/automation-trigger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// We only need the two Prisma models this helper touches
const mockPrisma = {
  organization: { findUnique: vi.fn() },
  businessHours: { findMany: vi.fn() },
};

// Dynamic import so mocks are in place before the module loads
async function getHelper() {
  const { isWithinBusinessHours } = await import("./automation-trigger.js");
  return isWithinBusinessHours;
}

describe("isWithinBusinessHours", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} }); // UTC
  });

  it("returns true when `now` falls inside a slot (UTC Mon 10:00)", async () => {
    // 2026-06-22 is a Monday
    const now = new Date("2026-06-22T10:00:00.000Z"); // Mon 10:00 UTC
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(true);
  });

  it("returns false when `now` is before slot start (UTC Mon 08:59)", async () => {
    const now = new Date("2026-06-22T08:59:00.000Z");
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when `now` is after slot end (UTC Mon 18:00 exactly)", async () => {
    const now = new Date("2026-06-22T18:00:00.000Z");
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when no slots are configured", async () => {
    const now = new Date("2026-06-22T10:00:00.000Z");
    mockPrisma.businessHours.findMany.mockResolvedValue([]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns false when now is on a day with no slot configured (Saturday)", async () => {
    const now = new Date("2026-06-20T10:00:00.000Z"); // Sat 10:00 UTC
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }, // Mon only
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(false);
  });

  it("returns true for second slot in a split-shift day", async () => {
    const now = new Date("2026-06-22T14:00:00.000Z"); // Mon 14:00
    mockPrisma.businessHours.findMany.mockResolvedValue([
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { dayOfWeek: 1, startTime: "13:00", endTime: "18:00" },
    ]);
    const fn = await getHelper();
    const result = await fn(mockPrisma as unknown as PrismaClient, "org-1", now);
    expect(result).toBe(true);
  });
});
```

- [ ] Run tests: `pnpm --filter @WBMSG/api test automation-trigger`
  - Expected: 6 passing

### Commit

```bash
git add apps/api/src/lib/automation-trigger.ts apps/api/src/lib/automation-trigger.test.ts
git commit -m "feat(automation): add isWithinBusinessHours helper with unit tests"
```

---

## Task 3 — Business Hours API Routes + Tests

**Files:**
- Create: `apps/api/src/routes/automation-settings.ts`
- Create: `apps/api/src/routes/automation-settings.test.ts`
- Modify: `apps/api/src/routes/index.ts`

### Steps

- [ ] Create `apps/api/src/routes/automation-settings.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { canAccess, canAccessSub } from "../lib/permissions.js";

interface BusinessHoursSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface PutBusinessHoursBody {
  slots: BusinessHoursSlot[];
}

export const automationSettingsRouter: FastifyPluginAsync = async (fastify) => {
  // All automation routes require automation_access
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccess(role, permissions, "automation_access")) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "automation_access permission required" },
      });
    }
  });

  // --- Business Hours ---

  fastify.get("/automation/business-hours", async (request, reply) => {
    const { organizationId } = request.auth;
    const slots = await fastify.prisma.businessHours.findMany({
      where: { organizationId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return reply.send({ data: slots });
  });

  fastify.put<{ Body: PutBusinessHoursBody }>(
    "/automation/business-hours",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_ooo")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_ooo permission required" },
        });
      }

      const { slots } = request.body;

      // Validate slot shapes
      for (const s of slots) {
        if (
          typeof s.dayOfWeek !== "number" || s.dayOfWeek < 0 || s.dayOfWeek > 6 ||
          !/^\d{2}:\d{2}$/.test(s.startTime) ||
          !/^\d{2}:\d{2}$/.test(s.endTime)
        ) {
          return reply.status(400).send({
            error: { code: "INVALID_SLOT", message: "Each slot needs dayOfWeek (0-6), startTime, endTime in HH:MM" },
          });
        }
      }

      // Atomic replace: delete all existing, insert new
      const [, created] = await fastify.prisma.$transaction([
        fastify.prisma.businessHours.deleteMany({ where: { organizationId } }),
        fastify.prisma.businessHours.createMany({
          data: slots.map((s) => ({
            organizationId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        }),
      ]);

      request.log.info({ organizationId, count: created.count }, "business hours replaced");
      return reply.send({ data: { count: created.count } });
    }
  );

  // --- Automation Settings (GET singleton) ---

  fastify.get("/automation/settings", async (request, reply) => {
    const { organizationId } = request.auth;
    const settings = await fastify.prisma.orgAutomationSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
    return reply.send({ data: settings });
  });

  // --- PUT OOO ---

  interface PutOooBody {
    oooEnabled?: boolean;
    oooMessage?: string | null;
    oooMessageData?: Record<string, unknown> | null;
  }

  fastify.put<{ Body: PutOooBody }>(
    "/automation/settings/ooo",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_ooo")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_ooo permission required" },
        });
      }

      const { oooEnabled, oooMessage, oooMessageData } = request.body;

      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...(oooEnabled !== undefined && { oooEnabled }),
          ...(oooMessage !== undefined && { oooMessage }),
          ...(oooMessageData !== undefined && { oooMessageData }),
        },
        update: {
          ...(oooEnabled !== undefined && { oooEnabled }),
          ...(oooMessage !== undefined && { oooMessage }),
          ...(oooMessageData !== undefined && { oooMessageData }),
        },
      });

      return reply.send({ data: settings });
    }
  );

  // --- PUT Welcome ---

  interface PutWelcomeBody {
    welcomeEnabled?: boolean;
    welcomePersonalized?: boolean;
    welcomeMessage?: string | null;
    welcomeMessageData?: Record<string, unknown> | null;
    welcomeNewMessage?: string | null;
    welcomeNewData?: Record<string, unknown> | null;
    welcomeReturningMessage?: string | null;
    welcomeReturningData?: Record<string, unknown> | null;
    welcomeFlowId?: string | null;
  }

  fastify.put<{ Body: PutWelcomeBody }>(
    "/automation/settings/welcome",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_welcome_message")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_welcome_message permission required" },
        });
      }

      const {
        welcomeEnabled, welcomePersonalized, welcomeMessage, welcomeMessageData,
        welcomeNewMessage, welcomeNewData, welcomeReturningMessage, welcomeReturningData,
        welcomeFlowId,
      } = request.body;

      const updateData = {
        ...(welcomeEnabled !== undefined && { welcomeEnabled }),
        ...(welcomePersonalized !== undefined && { welcomePersonalized }),
        ...(welcomeMessage !== undefined && { welcomeMessage }),
        ...(welcomeMessageData !== undefined && { welcomeMessageData }),
        ...(welcomeNewMessage !== undefined && { welcomeNewMessage }),
        ...(welcomeNewData !== undefined && { welcomeNewData }),
        ...(welcomeReturningMessage !== undefined && { welcomeReturningMessage }),
        ...(welcomeReturningData !== undefined && { welcomeReturningData }),
        ...(welcomeFlowId !== undefined && { welcomeFlowId }),
      };

      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: { organizationId, ...updateData },
        update: updateData,
      });

      return reply.send({ data: settings });
    }
  );

  // --- PUT Delayed Response ---

  interface PutDelayedBody {
    delayedEnabled?: boolean;
    delayedMinutes?: number;
    delayedMessage?: string | null;
    delayedMessageData?: Record<string, unknown> | null;
    delayedSendWithOoo?: boolean;
  }

  fastify.put<{ Body: PutDelayedBody }>(
    "/automation/settings/delayed",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_delayed_response")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_delayed_response permission required" },
        });
      }

      const { delayedEnabled, delayedMinutes, delayedMessage, delayedMessageData, delayedSendWithOoo } = request.body;

      // Validate minutes: must be 1–1440
      if (delayedMinutes !== undefined && (delayedMinutes < 1 || delayedMinutes > 1440)) {
        return reply.status(400).send({
          error: { code: "INVALID_MINUTES", message: "delayedMinutes must be between 1 and 1440" },
        });
      }

      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...(delayedEnabled !== undefined && { delayedEnabled }),
          ...(delayedMinutes !== undefined && { delayedMinutes }),
          ...(delayedMessage !== undefined && { delayedMessage }),
          ...(delayedMessageData !== undefined && { delayedMessageData }),
          ...(delayedSendWithOoo !== undefined && { delayedSendWithOoo }),
        },
        update: {
          ...(delayedEnabled !== undefined && { delayedEnabled }),
          ...(delayedMinutes !== undefined && { delayedMinutes }),
          ...(delayedMessage !== undefined && { delayedMessage }),
          ...(delayedMessageData !== undefined && { delayedMessageData }),
          ...(delayedSendWithOoo !== undefined && { delayedSendWithOoo }),
        },
      });

      return reply.send({ data: settings });
    }
  );
};
```

- [ ] Register in `apps/api/src/routes/index.ts`. Add import after existing imports:

```typescript
import { automationSettingsRouter } from "./automation-settings.js";
```

Add registration after `autoRepliesRouter`:

```typescript
  await fastify.register(automationSettingsRouter, { prefix: "/v1" });
```

- [ ] Create `apps/api/src/routes/automation-settings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  businessHours: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  orgAutomationSettings: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
};

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildApp(authOverride?: Partial<typeof mockAuth>): Promise<FastifyInstance> {
  return buildAppWith({ ...mockAuth, ...authOverride });
}

const mockAuth = {
  userId: "u-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {
    automation_access: "allow",
    "automation_access@automation_ooo": "allow",
    "automation_access@automation_welcome_message": "allow",
    "automation_access@automation_delayed_response": "allow",
  },
};

async function buildAppWith(auth: typeof mockAuth): Promise<FastifyInstance> {
  vi.resetModules();
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = auth; });
  const { automationSettingsRouter } = await import("./automation-settings.js");
  await app.register(automationSettingsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/automation/settings", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns default settings when no row exists (upsert creates it)", async () => {
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue(DEFAULT_SETTINGS);
    const res = await app.inject({ method: "GET", url: "/v1/automation/settings" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: typeof DEFAULT_SETTINGS }>();
    expect(body.data.oooEnabled).toBe(false);
    expect(body.data.delayedMinutes).toBe(30);
    expect(mockPrisma.orgAutomationSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" }, create: { organizationId: "org-1" }, update: {} })
    );
  });
});

describe("PUT /v1/automation/settings/ooo", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates OOO fields", async () => {
    const updated = { ...DEFAULT_SETTINGS, oooEnabled: true, oooMessage: "We are closed." };
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/ooo",
      payload: { oooEnabled: true, oooMessage: "We are closed." },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { oooEnabled: boolean; oooMessage: string } }>();
    expect(body.data.oooEnabled).toBe(true);
    expect(body.data.oooMessage).toBe("We are closed.");
  });

  it("returns 403 when agent role lacks automation_ooo sub-permission", async () => {
    const agentApp = await buildApp({
      role: "agent",
      permissions: { automation_access: "allow" }, // no sub perm
    });
    const res = await agentApp.inject({
      method: "PUT",
      url: "/v1/automation/settings/ooo",
      payload: { oooEnabled: true },
    });
    expect(res.statusCode).toBe(403);
    await agentApp.close();
  });
});

describe("GET /v1/automation/business-hours", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns empty array when no slots configured", async () => {
    mockPrisma.businessHours.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/automation/business-hours" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });
});

describe("PUT /v1/automation/business-hours", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("replaces slots atomically via $transaction", async () => {
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      // Simulate Prisma transaction: return array of results
      return [{ count: 0 }, { count: 2 }];
    });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: {
        slots: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
          { dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBe(2);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when slot has invalid dayOfWeek", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: { slots: [{ dayOfWeek: 7, startTime: "09:00", endTime: "18:00" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when slot has invalid time format", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: { slots: [{ dayOfWeek: 1, startTime: "9:00", endTime: "18:00" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 when role lacks automation_ooo sub-permission", async () => {
    const agentApp = await buildApp({
      role: "agent",
      permissions: { automation_access: "allow" },
    });
    const res = await agentApp.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: { slots: [] },
    });
    expect(res.statusCode).toBe(403);
    await agentApp.close();
  });
});

describe("PUT /v1/automation/settings/delayed", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 when delayedMinutes > 1440", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/delayed",
      payload: { delayedMinutes: 1441 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("updates delayed fields successfully", async () => {
    const updated = { ...DEFAULT_SETTINGS, delayedEnabled: true, delayedMinutes: 15 };
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/delayed",
      payload: { delayedEnabled: true, delayedMinutes: 15 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { delayedMinutes: number } }>().data.delayedMinutes).toBe(15);
  });
});
```

- [ ] Run tests: `pnpm --filter @WBMSG/api test automation-settings`
  - Expected: 9 passing

### Commit

```bash
git add apps/api/src/routes/automation-settings.ts apps/api/src/routes/automation-settings.test.ts apps/api/src/routes/index.ts
git commit -m "feat(automation): add Business Hours + Automation Settings API routes"
```

---

## Task 4 — RBAC Keys

**Files:**
- Modify: `apps/api/src/lib/default-role-permissions.ts`
- Modify: `apps/web/components/permissions-grid.tsx`

### Steps

- [ ] In `apps/api/src/lib/default-role-permissions.ts`, add the two new sub-permissions to `admin` and `manager` roles. In the `admin` block, after the line `"automation_access@automation_welcome_message": "allow",`:

```typescript
    "automation_access@automation_ooo": "allow",
    "automation_access@automation_delayed_response": "allow",
```

In the `manager` block, after `"automation_access@automation_welcome_message": "allow",`:

```typescript
    "automation_access@automation_ooo": "allow",
    "automation_access@automation_delayed_response": "allow",
```

Note: `agent` and `viewer` do not get these keys (deny-by-default).

- [ ] In `apps/web/components/permissions-grid.tsx`, find the `automation_access` group's `subPermissions` array and add after `{ key: "automation_welcome_message", label: "Welcome Message settings" }`:

```typescript
      { key: "automation_ooo", label: "Out of Office settings" },
      { key: "automation_delayed_response", label: "Delayed Response settings" },
```

- [ ] Run type-check: `pnpm type-check`

### Commit

```bash
git add apps/api/src/lib/default-role-permissions.ts apps/web/components/permissions-grid.tsx
git commit -m "feat(automation): add automation_ooo + automation_delayed_response RBAC keys"
```

---

## Task 5 — Delayed Response BullMQ Queue + Worker + Tests

**Files:**
- Modify: `apps/api/src/lib/queue.ts`
- Create: `apps/api/src/workers/delayed-response.worker.ts`
- Create: `apps/api/src/workers/delayed-response.worker.test.ts`

### Steps

- [ ] Add the delayed-response queue to `apps/api/src/lib/queue.ts`. After the `resumeFlowQueue` export:

```typescript
export const delayedResponseQueue = new Queue("delayed-response", {
  connection: redisConnection,
  // attempts:1 — sending a duplicate delayed message is worse than missing one
  defaultJobOptions: { attempts: 1 },
});
```

- [ ] Create `apps/api/src/workers/delayed-response.worker.ts`:

```typescript
import { Worker, Queue } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { isWithinBusinessHours } from "../lib/automation-trigger.js";
import { sendTextMessage } from "../lib/whatsapp.js";
import { recordOutbound } from "../lib/record-outbound.js";

export interface DelayedResponseJob {
  conversationId: string;
  organizationId: string;
  scheduledAt: string; // ISO string — used to check if agent replied since scheduling
}

export const delayedResponseWorker = new Worker<DelayedResponseJob>(
  "delayed-response",
  async (job) => {
    const { conversationId, organizationId, scheduledAt } = job.data;

    // 1. Load settings
    const settings = await prisma.orgAutomationSettings.findUnique({
      where: { organizationId },
    });
    if (!settings?.delayedEnabled || !settings.delayedMessage) return;

    // 2. Check if agent replied since job was scheduled
    const scheduledDate = new Date(scheduledAt);
    const outboundSince = await prisma.message.findFirst({
      where: {
        conversationId,
        direction: "outbound",
        sentAt: { gte: scheduledDate },
      },
    });
    if (outboundSince) return; // agent replied — skip

    // 3. Check if conversation is still open
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true, whatsappContactId: true },
    });
    if (!conversation || conversation.status !== "open") return;

    // 4. Business hours check
    const now = new Date();
    const withinHours = await isWithinBusinessHours(prisma, organizationId, now);
    if (!withinHours && !settings.delayedSendWithOoo) return;

    // 5. Load org credentials
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    if (!org?.phoneNumberId || !org?.wabaAccessToken) return;

    // 6. Interpolate contact variables into message
    const contact = await prisma.contact.findFirst({
      where: { organizationId, phoneNumber: conversation.whatsappContactId },
      select: { firstName: true, lastName: true, phoneNumber: true, email: true },
    });
    const message = interpolate(settings.delayedMessage, contact);

    // 7. Send
    const { messageId } = await sendTextMessage(
      org.phoneNumberId,
      conversation.whatsappContactId,
      message,
      org.wabaAccessToken
    );

    await recordOutbound(prisma, {
      conversationId,
      organizationId,
      contentType: "text",
      body: message,
      whatsappMessageId: messageId,
    });
  },
  { connection: redisConnection }
);

function interpolate(
  template: string,
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null } | null
): string {
  if (!contact) return template;
  const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return template
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}
```

- [ ] Create `apps/api/src/workers/delayed-response.worker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DelayedResponseJob } from "./delayed-response.worker.js";

// Mock all external dependencies before importing the worker module
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    orgAutomationSettings: { findUnique: vi.fn() },
    message: { findFirst: vi.fn() },
    conversation: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    contact: { findFirst: vi.fn() },
    message: { create: vi.fn() },
    conversation: { update: vi.fn() },
  },
}));
vi.mock("../lib/automation-trigger.js", () => ({
  isWithinBusinessHours: vi.fn(),
}));
vi.mock("../lib/whatsapp.js", () => ({
  sendTextMessage: vi.fn(),
}));
vi.mock("../lib/record-outbound.js", () => ({
  recordOutbound: vi.fn(),
}));
vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: Function) => ({
    __processor: processor,
  })),
  Queue: vi.fn(),
}));
vi.mock("../lib/queue.js", () => ({
  redisConnection: {},
}));

import { prisma } from "../lib/prisma.js";
import { isWithinBusinessHours } from "../lib/automation-trigger.js";
import { sendTextMessage } from "../lib/whatsapp.js";
import { recordOutbound } from "../lib/record-outbound.js";

const mockPrisma = prisma as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockIsWithin = isWithinBusinessHours as ReturnType<typeof vi.fn>;
const mockSendText = sendTextMessage as ReturnType<typeof vi.fn>;
const mockRecordOutbound = recordOutbound as ReturnType<typeof vi.fn>;

const BASE_SETTINGS = {
  delayedEnabled: true,
  delayedMessage: "Sorry for the wait, {{first_name}}!",
  delayedMinutes: 30,
  delayedSendWithOoo: false,
};
const BASE_CONVERSATION = { id: "conv-1", status: "open", whatsappContactId: "447000000000" };
const BASE_ORG = { phoneNumberId: "pn-1", wabaAccessToken: "tok-1" };
const BASE_CONTACT = { firstName: "Alice", lastName: "Smith", phoneNumber: "447000000000", email: null };
const JOB_DATA: DelayedResponseJob = {
  conversationId: "conv-1",
  organizationId: "org-1",
  scheduledAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
};

async function runProcessor(data: DelayedResponseJob = JOB_DATA) {
  const { Worker } = await import("bullmq");
  const workerInstances = (Worker as unknown as ReturnType<typeof vi.fn>).mock.results;
  const lastWorker = workerInstances[workerInstances.length - 1]?.value as { __processor: Function };
  return lastWorker.__processor({ data });
}

describe("delayed-response worker", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-import to capture fresh Worker constructor call
    await import("./delayed-response.worker.js");

    mockPrisma["orgAutomationSettings"]!["findUnique"].mockResolvedValue(BASE_SETTINGS);
    mockPrisma["message"]!["findFirst"].mockResolvedValue(null); // no outbound since scheduled
    mockPrisma["conversation"]!["findUnique"].mockResolvedValue(BASE_CONVERSATION);
    mockIsWithin.mockResolvedValue(true); // within business hours
    mockPrisma["organization"]!["findUnique"].mockResolvedValue(BASE_ORG);
    mockPrisma["contact"]!["findFirst"].mockResolvedValue(BASE_CONTACT);
    mockSendText.mockResolvedValue({ messageId: "wamid-1" });
    mockRecordOutbound.mockResolvedValue(undefined);
  });

  it("sends message when no agent replied and within hours", async () => {
    await runProcessor();
    expect(mockSendText).toHaveBeenCalledWith(
      "pn-1", "447000000000",
      "Sorry for the wait, Alice!",
      "tok-1"
    );
    expect(mockRecordOutbound).toHaveBeenCalledTimes(1);
  });

  it("skips when last message is outbound (agent already replied)", async () => {
    mockPrisma["message"]!["findFirst"].mockResolvedValue({ id: "m-1", direction: "outbound" });
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("skips when outside hours and delayedSendWithOoo is false", async () => {
    mockIsWithin.mockResolvedValue(false);
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("sends when outside hours and delayedSendWithOoo is true", async () => {
    mockIsWithin.mockResolvedValue(false);
    mockPrisma["orgAutomationSettings"]!["findUnique"].mockResolvedValue({
      ...BASE_SETTINGS,
      delayedSendWithOoo: true,
    });
    await runProcessor();
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it("skips when delayedEnabled is false", async () => {
    mockPrisma["orgAutomationSettings"]!["findUnique"].mockResolvedValue({
      ...BASE_SETTINGS,
      delayedEnabled: false,
    });
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it("skips when conversation is not open", async () => {
    mockPrisma["conversation"]!["findUnique"].mockResolvedValue({ ...BASE_CONVERSATION, status: "resolved" });
    await runProcessor();
    expect(mockSendText).not.toHaveBeenCalled();
  });
});
```

- [ ] Run tests: `pnpm --filter @WBMSG/api test delayed-response`
  - Expected: 6 passing

### Commit

```bash
git add apps/api/src/lib/queue.ts apps/api/src/workers/delayed-response.worker.ts apps/api/src/workers/delayed-response.worker.test.ts
git commit -m "feat(automation): add delayed-response BullMQ queue and worker"
```

---

## Task 6 — Automation Trigger Integration into Inbound Worker

**Files:**
- Modify: `apps/api/src/lib/automation-trigger.ts` (extend with `runAutomationTrigger`)
- Modify: `apps/api/src/workers/inbound-message.worker.ts` (call trigger after message stored)

### Steps

- [ ] Add the `runAutomationTrigger` function to `apps/api/src/lib/automation-trigger.ts`. Append after `isWithinBusinessHours`:

```typescript
import { Queue } from "bullmq";
import { redisConnection } from "./queue.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";

const delayedResponseQueue = new Queue("delayed-response", { connection: redisConnection });

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  createdAt: Date;
  lastMessageAt?: Date | null;
}

interface Conversation {
  id: string;
  status: string;
  lastInboundAt?: Date | null;
}

interface OrgCredentials {
  phoneNumberId: string | null;
  wabaAccessToken: string | null;
}

function interpolateVars(
  template: string,
  contact: Pick<Contact, "firstName" | "lastName" | "phoneNumber" | "email">
): string {
  const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return template
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

export async function runAutomationTrigger(
  prisma: PrismaClient,
  organizationId: string,
  conversation: Conversation,
  contact: Contact,
  org: OrgCredentials,
  messageReceivedAt: Date
): Promise<void> {
  const settings = await prisma.orgAutomationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings) return;

  const now = messageReceivedAt;

  // -----------------------------------------------------------------------
  // 1. WELCOME CHECK
  // -----------------------------------------------------------------------
  if (settings.welcomeEnabled) {
    // Is this the contact's first-ever message?
    // "first message" = contact was created very recently (same transaction)
    // We detect it by checking if any prior inbound message exists for this conversation.
    const priorMessage = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        direction: "inbound",
        sentAt: { lt: messageReceivedAt },
      },
    });
    const isFirstContact = !priorMessage;

    // Was last inbound more than 24h ago?
    const isReturning =
      !isFirstContact &&
      conversation.lastInboundAt != null &&
      now.getTime() - new Date(conversation.lastInboundAt).getTime() > 24 * 60 * 60 * 1000;

    let welcomeText: string | null = null;

    if (isFirstContact || isReturning) {
      if (settings.welcomePersonalized) {
        welcomeText = isFirstContact
          ? (settings.welcomeNewMessage ?? null)
          : (settings.welcomeReturningMessage ?? null);
      } else {
        welcomeText = settings.welcomeMessage ?? null;
      }
    }

    if (welcomeText && org.phoneNumberId && org.wabaAccessToken) {
      const interpolated = interpolateVars(welcomeText, contact);
      const { messageId } = await sendTextMessage(
        org.phoneNumberId,
        contact.phoneNumber,
        interpolated,
        org.wabaAccessToken
      );
      await recordOutbound(prisma, {
        conversationId: conversation.id,
        organizationId,
        contentType: "text",
        body: interpolated,
        whatsappMessageId: messageId,
      });

      // Trigger optional welcome flow
      if (settings.welcomeFlowId) {
        const flow = await prisma.flow.findFirst({
          where: { id: settings.welcomeFlowId, isActive: true },
        });
        if (flow) {
          // Import lazily to avoid circular deps
          const { runFlow } = await import("./flow-runner.js") as { runFlow: Function };
          await runFlow(prisma, flow.id, flow.flowDefinition, {
            conversationId: conversation.id,
            organizationId,
            contactPhone: contact.phoneNumber,
            messageBody: "",
          });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // 2. BUSINESS HOURS CHECK
  // -----------------------------------------------------------------------
  const withinHours = await isWithinBusinessHours(prisma, organizationId, now);

  // -----------------------------------------------------------------------
  // 3. OOO CHECK (outside hours only, conversation not already open-with-agent)
  // -----------------------------------------------------------------------
  if (!withinHours && settings.oooEnabled && settings.oooMessage) {
    // Only send OOO if conversation status is NOT "open" (per spec)
    // "open" means an agent has already engaged
    if (conversation.status !== "open" && org.phoneNumberId && org.wabaAccessToken) {
      const oooText = interpolateVars(settings.oooMessage, contact);
      const { messageId } = await sendTextMessage(
        org.phoneNumberId,
        contact.phoneNumber,
        oooText,
        org.wabaAccessToken
      );
      await recordOutbound(prisma, {
        conversationId: conversation.id,
        organizationId,
        contentType: "text",
        body: oooText,
        whatsappMessageId: messageId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // 4. DELAYED RESPONSE SCHEDULING
  // -----------------------------------------------------------------------
  if (settings.delayedEnabled && (withinHours || settings.delayedSendWithOoo)) {
    const jobId = `delayed-response:${conversation.id}`;
    const delayMs = settings.delayedMinutes * 60 * 1000;

    // Cancel any existing pending job for this conversation before re-scheduling
    try {
      const existingJob = await delayedResponseQueue.getJob(jobId);
      if (existingJob) await existingJob.remove();
    } catch {
      // Non-fatal — job may have already fired
    }

    await delayedResponseQueue.add(
      "fire",
      {
        conversationId: conversation.id,
        organizationId,
        scheduledAt: now.toISOString(),
      } satisfies { conversationId: string; organizationId: string; scheduledAt: string },
      {
        jobId,
        delay: delayMs,
      }
    );
  }
}

/**
 * Called from inbound-message.worker.ts when an outbound agent message is sent.
 * Cancels any pending delayed-response job for the conversation.
 */
export async function cancelDelayedResponseJob(conversationId: string): Promise<void> {
  const jobId = `delayed-response:${conversationId}`;
  try {
    const job = await delayedResponseQueue.getJob(jobId);
    if (job) await job.remove();
  } catch {
    // Non-fatal
  }
}
```

- [ ] In `apps/api/src/workers/inbound-message.worker.ts`, add the import at the top (alongside existing imports):

```typescript
import { runAutomationTrigger, cancelDelayedResponseJob } from "../lib/automation-trigger.js";
```

- [ ] In `inbound-message.worker.ts`, after the block where `storedMessage` is created and `prisma.conversation.update` runs (approximately after `lastInboundAt` is updated), add the automation trigger call. Insert **before** the auto-reply evaluation block (around line 301, before `// --- Auto-reply evaluation`):

```typescript
    // --- Automation Trigger (OOO / Welcome / Delayed Response) ---
    // Runs on every inbound message. Must come after message is stored and
    // conversation.lastInboundAt is updated.
    if (org?.phoneNumberId && org?.wabaAccessToken) {
      const fullContact = await prisma.contact.findFirst({
        where: { organizationId, phoneNumber: whatsappContactPhone },
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, createdAt: true },
      });
      if (fullContact && refreshed) {
        await runAutomationTrigger(
          prisma,
          organizationId,
          {
            id: refreshed.id,
            status: refreshed.status,
            lastInboundAt: refreshed.lastInboundAt,
          },
          { ...fullContact, lastMessageAt: refreshed.lastMessageAt },
          { phoneNumberId: org.phoneNumberId, wabaAccessToken: org.wabaAccessToken },
          messageDate
        ).catch((err: unknown) => {
          console.error(`[worker:inbound] automation trigger failed conv=${conversation.id}`, err);
        });
      }
    }
```

- [ ] In `inbound-message.worker.ts`, find where outbound messages are recorded by agents and add the cancel call. The existing `recordOutbound` is in `apps/api/src/lib/record-outbound.ts`. Add cancellation in the routes where agents send messages (`apps/api/src/routes/messages.ts`). Find where `recordOutbound` is called for an outbound agent message and after it, add:

```typescript
      await cancelDelayedResponseJob(conversationId);
```

  **Note:** Also check `apps/api/src/routes/messages.ts` for the outbound send path and locate the right place. Look for the POST handler that sends messages; after `recordOutbound`, add the cancellation import and call.

- [ ] Run type-check: `pnpm type-check`

### Commit

```bash
git add apps/api/src/lib/automation-trigger.ts apps/api/src/workers/inbound-message.worker.ts
git commit -m "feat(automation): integrate automation trigger into inbound message worker"
```

---

## Task 7 — Outbound Cancel Wiring in Messages Route

**Files:**
- Modify: `apps/api/src/routes/messages.ts`

### Steps

- [ ] Read `apps/api/src/routes/messages.ts` to find the outbound message send handler (the POST endpoint that agents use to send messages). Identify where `recordOutbound` is called.

- [ ] Add the import at the top of `messages.ts`:

```typescript
import { cancelDelayedResponseJob } from "../lib/automation-trigger.js";
```

- [ ] After each call to `recordOutbound(...)` (or equivalent message creation for outbound) in `messages.ts`, add:

```typescript
      void cancelDelayedResponseJob(conversationId).catch(() => {
        // Non-fatal — failing to cancel doesn't block the reply
      });
```

- [ ] Run type-check: `pnpm type-check`

### Commit

```bash
git add apps/api/src/routes/messages.ts
git commit -m "feat(automation): cancel delayed-response job when agent sends outbound message"
```

---

## Task 8 — Frontend: Business Hours Card

**Files:**
- Create: `apps/web/app/(dashboard)/flows/business-hours-card.tsx`
- Modify: `apps/web/app/(dashboard)/flows/page.tsx`

### Data shape

The card fetches `GET /v1/automation/business-hours` → array of `{ id, dayOfWeek, startTime, endTime }` and PUTs `{ slots: [...] }` to replace them.

### Steps

- [ ] Create `apps/web/app/(dashboard)/flows/business-hours-card.tsx`:

```tsx
"use client";

import { useState, useCallback, JSX } from "react";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Slot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface DayRow {
  dayOfWeek: number;
  label: string;
  enabled: boolean;
  slots: Array<{ startTime: string; endTime: string }>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function slotsToRows(slots: Slot[]): DayRow[] {
  const rows: DayRow[] = DAY_LABELS.map((label, i) => ({
    dayOfWeek: i,
    label,
    enabled: false,
    slots: [],
  }));
  for (const s of slots) {
    const row = rows[s.dayOfWeek];
    if (row) {
      row.enabled = true;
      row.slots.push({ startTime: s.startTime, endTime: s.endTime });
    }
  }
  // Ensure each enabled row has at least one slot
  for (const row of rows) {
    if (row.enabled && row.slots.length === 0) {
      row.slots.push({ startTime: "09:00", endTime: "18:00" });
    }
  }
  return rows;
}

function rowsToSlots(rows: DayRow[]): Slot[] {
  return rows
    .filter((r) => r.enabled)
    .flatMap((r) =>
      r.slots.map((s) => ({ dayOfWeek: r.dayOfWeek, startTime: s.startTime, endTime: s.endTime }))
    );
}

interface Props {
  initialSlots: Slot[];
  token: string;
}

export function BusinessHoursCard({ initialSlots, token }: Props): JSX.Element {
  const defaultRows: DayRow[] =
    initialSlots.length > 0
      ? slotsToRows(initialSlots)
      : DAY_LABELS.map((label, i) => ({
          dayOfWeek: i,
          label,
          enabled: i >= 1 && i <= 5, // Mon–Fri enabled by default
          slots: [{ startTime: "09:00", endTime: "18:00" }],
        }));

  const [rows, setRows] = useState<DayRow[]>(defaultRows);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = useCallback((dayIndex: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayIndex
          ? {
              ...r,
              enabled: !r.enabled,
              slots: r.slots.length === 0 ? [{ startTime: "09:00", endTime: "18:00" }] : r.slots,
            }
          : r
      )
    );
    setSaved(false);
  }, []);

  const updateSlot = useCallback(
    (dayIndex: number, slotIndex: number, field: "startTime" | "endTime", value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.dayOfWeek === dayIndex
            ? {
                ...r,
                slots: r.slots.map((s, i) => (i === slotIndex ? { ...s, [field]: value } : s)),
              }
            : r
        )
      );
      setSaved(false);
    },
    []
  );

  const addSlot = useCallback((dayIndex: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayIndex
          ? { ...r, slots: [...r.slots, { startTime: "09:00", endTime: "18:00" }] }
          : r
      )
    );
    setSaved(false);
  }, []);

  const removeSlot = useCallback((dayIndex: number, slotIndex: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayIndex
          ? { ...r, slots: r.slots.filter((_, i) => i !== slotIndex) }
          : r
      )
    );
    setSaved(false);
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const slots = rowsToSlots(rows);
      const res = await fetch(`${API_URL}/v1/automation/business-hours`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Business Hours</h2>
      <p className="text-sm text-gray-500 mb-4">
        Define when your team is available. OOO and Delayed Response use this schedule.
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.dayOfWeek} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {/* Day toggle */}
              <button
                type="button"
                onClick={() => toggleDay(row.dayOfWeek)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  row.enabled ? "bg-green-500" : "bg-gray-200"
                }`}
                aria-label={`Toggle ${row.label}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    row.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="w-8 text-sm font-medium text-gray-700">{row.label}</span>

              {row.enabled ? (
                <div className="flex flex-col gap-1 flex-1">
                  {row.slots.map((slot, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(row.dayOfWeek, si, "startTime", e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
                      />
                      <span className="text-gray-400 text-sm">to</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(row.dayOfWeek, si, "endTime", e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
                      />
                      {row.slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSlot(row.dayOfWeek, si)}
                          className="text-gray-400 hover:text-red-500 text-xs"
                          aria-label="Remove slot"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addSlot(row.dayOfWeek)}
                    className="text-xs text-brand-600 hover:underline text-left mt-0.5"
                  >
                    + Add slot
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic">Closed</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
      </div>
    </div>
  );
}
```

- [ ] Modify `apps/web/app/(dashboard)/flows/page.tsx` to:
  1. Add a new `getBusinessHours` data-fetching function
  2. Import `BusinessHoursCard`
  3. Render the card after `<AutoRepliesSection />`

  Add data fetching function after `getFlows`:

```typescript
async function getBusinessHours(token: string): Promise<Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>> {
  try {
    const res = await fetch(`${API_URL}/v1/automation/business-hours`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }> }).data : [];
  } catch { return []; }
}
```

  Add import at top of file:

```typescript
import { BusinessHoursCard } from "./business-hours-card";
```

  Update the page component data fetching (add `getBusinessHours` in the `Promise.all`):

```typescript
  const [flows, { role, permissions }, businessHours] = await Promise.all([
    getFlows(token),
    getUserData(token),
    getBusinessHours(token),
  ]);
```

  Render after `<AutoRepliesSection />`:

```tsx
      <BusinessHoursCard initialSlots={businessHours} token={token} />
```

### Commit

```bash
git add apps/web/app/(dashboard)/flows/business-hours-card.tsx apps/web/app/(dashboard)/flows/page.tsx
git commit -m "feat(automation): add Business Hours card to Flows page"
```

---

## Task 9 — Frontend: OOO + Welcome + Delayed Response Cards

**Files:**
- Create: `apps/web/app/(dashboard)/flows/automation-message-card.tsx`
- Create: `apps/web/app/(dashboard)/flows/ooo-card.tsx`
- Create: `apps/web/app/(dashboard)/flows/welcome-card.tsx`
- Create: `apps/web/app/(dashboard)/flows/delayed-card.tsx`
- Modify: `apps/web/app/(dashboard)/flows/page.tsx`

### Shared sub-component: `automation-message-card.tsx`

This is a reusable card providing the text area + variable chip inserter + emoji button + preview panel. All three feature cards (OOO, Welcome, Delayed) use it.

- [ ] Create `apps/web/app/(dashboard)/flows/automation-message-card.tsx`:

```tsx
"use client";

import { JSX, useRef } from "react";

const VARIABLES = [
  { label: "{{first_name}}", insert: "{{first_name}}" },
  { label: "{{last_name}}", insert: "{{last_name}}" },
  { label: "{{full_name}}", insert: "{{full_name}}" },
  { label: "{{phone}}", insert: "{{phone}}" },
];

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

export function MessageTextArea({ label, value, onChange, placeholder, rows = 4 }: Props): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map((v) => (
          <button
            key={v.insert}
            type="button"
            onClick={() => insertAtCursor(v.insert)}
            className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded px-2 py-0.5 font-mono"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** WhatsApp-style message bubble preview */
export function WaBubblePreview({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="bg-green-100 text-gray-800 rounded-lg rounded-tr-none px-3 py-2 max-w-xs text-sm whitespace-pre-wrap shadow-sm">
        {text || <span className="text-gray-400 italic">Your message preview will appear here</span>}
      </div>
    </div>
  );
}
```

- [ ] Create `apps/web/app/(dashboard)/flows/ooo-card.tsx`:

```tsx
"use client";

import { useState, JSX } from "react";
import { Button } from "@/components/ui/Button";
import { MessageTextArea, WaBubblePreview } from "./automation-message-card";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OooSettings {
  oooEnabled: boolean;
  oooMessage: string | null;
}

interface Props {
  initial: OooSettings;
  token: string;
  hasBusinessHours: boolean;
}

export function OooCard({ initial, token, hasBusinessHours }: Props): JSX.Element {
  const [enabled, setEnabled] = useState(initial.oooEnabled);
  const [message, setMessage] = useState(initial.oooMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/automation/settings/ooo`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ oooEnabled: enabled, oooMessage: message || null }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PermissionGate permission="automation_access" sub="automation_ooo">
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Out of Office Message</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Automatically reply when a customer messages outside business hours.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEnabled(!enabled); setSaved(false); }}
            disabled={!hasBusinessHours}
            title={!hasBusinessHours ? "Configure Business Hours first" : undefined}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              !hasBusinessHours ? "opacity-40 cursor-not-allowed bg-gray-200" :
              enabled ? "bg-green-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MessageTextArea
              label="Message"
              value={message}
              onChange={(v) => { setMessage(v); setSaved(false); }}
              placeholder="Sorry, we're currently out of office. We'll get back to you during business hours."
            />
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
              <WaBubblePreview text={message} />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </PermissionGate>
  );
}
```

- [ ] Create `apps/web/app/(dashboard)/flows/welcome-card.tsx`:

```tsx
"use client";

import { useState, JSX } from "react";
import { Button } from "@/components/ui/Button";
import { MessageTextArea, WaBubblePreview } from "./automation-message-card";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface WelcomeSettings {
  welcomeEnabled: boolean;
  welcomePersonalized: boolean;
  welcomeMessage: string | null;
  welcomeNewMessage: string | null;
  welcomeReturningMessage: string | null;
  welcomeFlowId: string | null;
}

interface Flow {
  id: string;
  name: string;
}

interface Props {
  initial: WelcomeSettings;
  flows: Flow[];
  token: string;
}

export function WelcomeCard({ initial, flows, token }: Props): JSX.Element {
  const [enabled, setEnabled] = useState(initial.welcomeEnabled);
  const [personalized, setPersonalized] = useState(initial.welcomePersonalized);
  const [message, setMessage] = useState(initial.welcomeMessage ?? "");
  const [newMessage, setNewMessage] = useState(initial.welcomeNewMessage ?? "");
  const [returningMessage, setReturningMessage] = useState(initial.welcomeReturningMessage ?? "");
  const [flowId, setFlowId] = useState(initial.welcomeFlowId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        welcomeEnabled: enabled,
        welcomePersonalized: personalized,
        welcomeFlowId: flowId || null,
      };
      if (personalized) {
        body["welcomeNewMessage"] = newMessage || null;
        body["welcomeReturningMessage"] = returningMessage || null;
      } else {
        body["welcomeMessage"] = message || null;
      }
      const res = await fetch(`${API_URL}/v1/automation/settings/welcome`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resBody = await res.json() as { error?: { message?: string } };
        throw new Error(resBody.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const previewText = personalized ? newMessage : message;

  return (
    <PermissionGate permission="automation_access" sub="automation_welcome_message">
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Welcome Message</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Send an automatic welcome when a customer messages for the first time or after 24h of inactivity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEnabled(!enabled); setSaved(false); }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {enabled && (
          <div className="space-y-5">
            {/* Personalisation toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="personalized"
                checked={personalized}
                onChange={(e) => { setPersonalized(e.target.checked); setSaved(false); }}
                className="rounded"
              />
              <label htmlFor="personalized" className="text-sm text-gray-700">
                Add personalisation (different messages for new vs returning customers)
              </label>
            </div>

            {personalized ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <MessageTextArea
                    label="New customers"
                    value={newMessage}
                    onChange={(v) => { setNewMessage(v); setSaved(false); }}
                    placeholder="Hi {{first_name}}, welcome! How can we help you today?"
                  />
                  <MessageTextArea
                    label="Existing / returning customers"
                    value={returningMessage}
                    onChange={(v) => { setReturningMessage(v); setSaved(false); }}
                    placeholder="Welcome back, {{first_name}}! How can we help you?"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview (new customer)</p>
                  <WaBubblePreview text={newMessage} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MessageTextArea
                  label="Message"
                  value={message}
                  onChange={(v) => { setMessage(v); setSaved(false); }}
                  placeholder="Hi {{first_name}}, thanks for reaching out! How can we help?"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                  <WaBubblePreview text={previewText} />
                </div>
              </div>
            )}

            {/* CTA: Bot Flow */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CTA after welcome message
              </label>
              <select
                value={flowId}
                onChange={(e) => { setFlowId(e.target.value); setSaved(false); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
              >
                <option value="">None (plain text only)</option>
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </PermissionGate>
  );
}
```

- [ ] Create `apps/web/app/(dashboard)/flows/delayed-card.tsx`:

```tsx
"use client";

import { useState, JSX } from "react";
import { Button } from "@/components/ui/Button";
import { MessageTextArea, WaBubblePreview } from "./automation-message-card";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface DelayedSettings {
  delayedEnabled: boolean;
  delayedMinutes: number;
  delayedMessage: string | null;
  delayedSendWithOoo: boolean;
}

interface Props {
  initial: DelayedSettings;
  token: string;
}

export function DelayedCard({ initial, token }: Props): JSX.Element {
  const initHours = Math.floor(initial.delayedMinutes / 60);
  const initMins = initial.delayedMinutes % 60;

  const [enabled, setEnabled] = useState(initial.delayedEnabled);
  const [hours, setHours] = useState(initHours);
  const [mins, setMins] = useState(initMins);
  const [message, setMessage] = useState(initial.delayedMessage ?? "");
  const [sendWithOoo, setSendWithOoo] = useState(initial.delayedSendWithOoo);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMinutes = hours * 60 + mins;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (totalMinutes < 1 || totalMinutes > 1440) {
        throw new Error("Delay must be between 1 minute and 24 hours");
      }
      const res = await fetch(`${API_URL}/v1/automation/settings/delayed`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          delayedEnabled: enabled,
          delayedMinutes: totalMinutes,
          delayedMessage: message || null,
          delayedSendWithOoo: sendWithOoo,
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PermissionGate permission="automation_access" sub="automation_delayed_response">
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delayed Response</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Send an automatic message if no agent replies within the specified time during business hours.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEnabled(!enabled); setSaved(false); }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {enabled && (
          <div className="space-y-5">
            {/* Delay timer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                If no agent replies within
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={(e) => { setHours(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0))); setSaved(false); }}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-16 text-center"
                />
                <span className="text-sm text-gray-600">hrs</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={mins}
                  onChange={(e) => { setMins(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0))); setSaved(false); }}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-16 text-center"
                />
                <span className="text-sm text-gray-600">mins</span>
              </div>
              {totalMinutes < 1 && (
                <p className="text-xs text-red-500 mt-1">Must be at least 1 minute.</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MessageTextArea
                label="Message"
                value={message}
                onChange={(v) => { setMessage(v); setSaved(false); }}
                placeholder="Thanks for your patience! Our team will get back to you shortly."
              />
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                <WaBubblePreview text={message} />
              </div>
            </div>

            {/* Send with OOO toggle */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="sendWithOoo"
                checked={sendWithOoo}
                onChange={(e) => { setSendWithOoo(e.target.checked); setSaved(false); }}
                className="rounded mt-0.5"
              />
              <div>
                <label htmlFor="sendWithOoo" className="text-sm text-gray-700 cursor-pointer">
                  Send along with Out of Office message
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  If enabled, the delayed response fires even outside business hours.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || (enabled && totalMinutes < 1)}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </PermissionGate>
  );
}
```

- [ ] Modify `apps/web/app/(dashboard)/flows/page.tsx` to fetch automation settings and render the three new cards. Add data-fetch function after `getBusinessHours`:

```typescript
async function getAutomationSettings(token: string): Promise<{
  oooEnabled: boolean; oooMessage: string | null;
  welcomeEnabled: boolean; welcomePersonalized: boolean;
  welcomeMessage: string | null; welcomeNewMessage: string | null;
  welcomeReturningMessage: string | null; welcomeFlowId: string | null;
  delayedEnabled: boolean; delayedMinutes: number;
  delayedMessage: string | null; delayedSendWithOoo: boolean;
} | null> {
  try {
    const res = await fetch(`${API_URL}/v1/automation/settings`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json() as { data: ReturnType<typeof getAutomationSettings> extends Promise<infer T> ? T : never }).data;
  } catch { return null; }
}
```

  Add imports at top of `page.tsx`:

```typescript
import { OooCard } from "./ooo-card";
import { WelcomeCard } from "./welcome-card";
import { DelayedCard } from "./delayed-card";
```

  Update `Promise.all` call:

```typescript
  const [flows, { role, permissions }, businessHours, automationSettings] = await Promise.all([
    getFlows(token),
    getUserData(token),
    getBusinessHours(token),
    getAutomationSettings(token),
  ]);
```

  Render after `<BusinessHoursCard ... />`:

```tsx
      {automationSettings && (
        <>
          <OooCard
            initial={{
              oooEnabled: automationSettings.oooEnabled,
              oooMessage: automationSettings.oooMessage,
            }}
            token={token}
            hasBusinessHours={businessHours.length > 0}
          />
          <WelcomeCard
            initial={{
              welcomeEnabled: automationSettings.welcomeEnabled,
              welcomePersonalized: automationSettings.welcomePersonalized,
              welcomeMessage: automationSettings.welcomeMessage,
              welcomeNewMessage: automationSettings.welcomeNewMessage,
              welcomeReturningMessage: automationSettings.welcomeReturningMessage,
              welcomeFlowId: automationSettings.welcomeFlowId,
            }}
            flows={flows.filter((f) => f.isActive)}
            token={token}
          />
          <DelayedCard
            initial={{
              delayedEnabled: automationSettings.delayedEnabled,
              delayedMinutes: automationSettings.delayedMinutes,
              delayedMessage: automationSettings.delayedMessage,
              delayedSendWithOoo: automationSettings.delayedSendWithOoo,
            }}
            token={token}
          />
        </>
      )}
```

- [ ] Run type-check: `pnpm type-check`

### Commit

```bash
git add apps/web/app/(dashboard)/flows/automation-message-card.tsx apps/web/app/(dashboard)/flows/ooo-card.tsx apps/web/app/(dashboard)/flows/welcome-card.tsx apps/web/app/(dashboard)/flows/delayed-card.tsx apps/web/app/(dashboard)/flows/page.tsx
git commit -m "feat(automation): add OOO, Welcome, and Delayed Response cards to Flows page"
```

---

## Verification Checklist

Run these before declaring the branch complete:

```bash
# API tests
pnpm --filter @WBMSG/api test automation-trigger    # 6 passing
pnpm --filter @WBMSG/api test automation-settings   # 9 passing
pnpm --filter @WBMSG/api test delayed-response      # 6 passing

# Type check (whole monorepo)
pnpm type-check

# Lint
pnpm lint
```

Manual smoke tests:
1. Navigate to Flows page → four new cards appear below Auto-Replies section
2. Set Mon–Fri 09:00–18:00 in Business Hours card → Save → reload → slots persist
3. Enable OOO card (blocked until BH saved), add message, Save
4. Simulate an inbound message outside BH → verify OOO message appears in conversation
5. Enable Delayed Response (30 min), Save → send inbound message → job appears in Redis
6. Agent replies in inbox → job cancelled → no delayed message sent
7. Agent role (no `automation_ooo` sub-perm): PUT to `/v1/automation/settings/ooo` returns 403
8. Admin: both new sub-permissions visible in Roles settings page

---

## Self-Review Against Spec

| Spec requirement | Covered in |
|---|---|
| `BusinessHours` model (multi-slot per day) | Task 1 |
| `OrgAutomationSettings` model | Task 1 |
| GET/PUT business-hours (atomic replace) | Task 3 |
| GET/PUT settings singleton (upsert on first GET) | Task 3 |
| `automation_ooo` + `automation_delayed_response` RBAC keys | Task 4 |
| `isWithinBusinessHours` using org timezone from settings | Task 2 |
| Inbound trigger: Welcome (new vs returning, 24h window) | Task 6 |
| Inbound trigger: OOO (outside hours, conversation not "open") | Task 6 |
| Inbound trigger: Delayed schedule with job key per conversation | Task 6 |
| Cancel delayed job on outbound agent message | Task 7 |
| Delayed worker: skip if agent replied | Task 5 |
| Delayed worker: skip if outside hours and `delayedSendWithOoo=false` | Task 5 |
| Delayed worker: send if outside hours and `delayedSendWithOoo=true` | Task 5 |
| Variable interpolation (`{{first_name}}` etc.) in all messages | Task 5+6 |
| Welcome flow CTA after welcome message | Task 6 |
| Business Hours card (weekly grid, time pickers, multi-slot) | Task 8 |
| OOO card (disabled until BH saved, preview bubble) | Task 9 |
| Welcome card (personalization toggle, single/split messages) | Task 9 |
| Delayed card (hours+mins picker, sendWithOoo checkbox) | Task 9 |
| PermissionGate wrapping OOO and Delayed cards | Task 9 |
| Permissions grid updated | Task 4 |
| Product Collections / WhatsApp Forms | Out of scope (not implemented) |
| Per-agent OOO | Out of scope (not implemented) |
| Timezone picker UI | Out of scope (reads from `Organization.settings.timezone`) |
