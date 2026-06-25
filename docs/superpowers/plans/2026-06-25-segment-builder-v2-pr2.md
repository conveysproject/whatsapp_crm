# Segment Builder V2 — PR2: Events System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ContactEvent model, event logging API, auto-logging from workers, and enable the Events tab in SegmentBuilderV2 for event-based contact filtering.

**Architecture:** New `ContactEvent` table stores per-contact events with a `properties` JSON column. The segment evaluator's `events` branch queries `contactEvents: { some: { ... } }` in Prisma. Existing workers (flow-execution, campaign-dispatch) and the WhatsApp webhook log events automatically. The Events tab in `SegmentBuilderV2` fetches event names and properties dynamically from the API.

**Prerequisites:** PR1 merged. `FilterRule`, `EventsRule`, `EventSubCondition` types exist in both API and web. `SegmentBuilderV2` renders `EventsPlaceholder` for the events tab.

**Tech Stack:** Fastify 4, Prisma 7, Next.js 15 App Router, React 18, Tailwind CSS, Vitest

## Global Constraints

- API: ESM-only — use `.js` extensions in all imports even for `.ts` source files
- TypeScript strict mode — no `any`, no implicit returns
- No `console.log` — use Fastify logger (`request.log`) or omit
- All Prisma queries must include `organizationId` in `where` clauses
- Commits follow Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- Branch from `develop`

---

## File Map

**Modified (API — schema):**
- `apps/api/prisma/schema.prisma` — add `ContactEvent` model and `events` relation on `Contact`

**Created (API):**
- `apps/api/src/routes/contact-events.ts` — POST /v1/contacts/:id/events, GET /v1/contacts/events/names, GET /v1/contacts/events/:name/properties
- `apps/api/src/routes/contact-events.test.ts` — tests for all three routes

**Modified (API):**
- `apps/api/src/lib/segment-evaluator.ts` — add events branch to `buildClause`
- `apps/api/src/lib/segment-evaluator.test.ts` — add events rule tests
- `apps/api/src/workers/flow-execution.worker.ts` — log `flow_started`, `flow_completed`
- `apps/api/src/workers/campaign-dispatch.worker.ts` — log `campaign_sent`
- WhatsApp webhook handler (find file in Task 4) — log `campaign_delivered`, `campaign_read`
- `apps/api/src/index.ts` (or route registration file) — register contact-events router

**Modified (web):**
- `apps/web/components/segments/SegmentBuilderV2.tsx` — replace `EventsPlaceholder` with full `EventsRowContent`

---

## Task 1: ContactEvent DB model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add ContactEvent model to schema**

In `apps/api/prisma/schema.prisma`:

1. Add `events ContactEvent[]` to the `Contact` model relations block (after the existing relations).

2. Add the new model after the `Contact` model block:

```prisma
model ContactEvent {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  contactId      String   @map("contact_id")
  contact        Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  name           String
  properties     Json     @default("{}")
  occurredAt     DateTime @default(now()) @map("occurred_at")
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([organizationId, contactId])
  @@index([organizationId, name])
  @@index([contactId, name])
  @@map("contact_events")
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_contact_events
```

Expected: migration file created, Prisma client regenerated with `contactEvent` model.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "chore(db): add ContactEvent model"
```

---

## Task 2: Contact events API routes

**Files:**
- Create: `apps/api/src/routes/contact-events.ts`
- Create: `apps/api/src/routes/contact-events.test.ts`

**Interfaces:**
- Produces:
  - `POST /v1/contacts/:id/events` — log a contact event
  - `GET /v1/contacts/events/names` — distinct event names for org
  - `GET /v1/contacts/events/:name/properties` — distinct property keys for an event

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/contact-events.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contact: { findFirst: vi.fn() },
  contactEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { contactEventsRouter } = await import("./contact-events.js");
  await app.register(contactEventsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/contacts/:id/events", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates event for contact in same org", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contactEvent.create.mockResolvedValue({
      id: "ev-1", contactId: "c-1", organizationId: "org-1",
      name: "flow_completed", properties: { flowId: "f-1" }, occurredAt: new Date(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/c-1/events",
      payload: { name: "flow_completed", properties: { flowId: "f-1" } },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contactEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "flow_completed", organizationId: "org-1", contactId: "c-1" }),
      })
    );
  });

  it("returns 404 when contact not in org", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/unknown/events",
      payload: { name: "flow_completed" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /v1/contacts/events/names", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns distinct event names sorted", async () => {
    mockPrisma.contactEvent.groupBy.mockResolvedValue([
      { name: "flow_completed" },
      { name: "campaign_sent" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/events/names" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: string[] }>().data).toEqual(["campaign_sent", "flow_completed"]);
  });
});

describe("GET /v1/contacts/events/:name/properties", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns distinct property keys for event name", async () => {
    mockPrisma.contactEvent.findMany.mockResolvedValue([
      { properties: { flowId: "f-1", flowName: "Onboarding" } },
      { properties: { flowId: "f-2" } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/events/flow_completed/properties" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: string[] }>();
    expect(body.data).toContain("flowId");
    expect(body.data).toContain("flowName");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose contact-events
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `contact-events.ts`**

Create `apps/api/src/routes/contact-events.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import type { ContactId } from "@WBMSG/shared";
import { canAccess } from "../lib/permissions.js";

interface EventBody {
  name: string;
  properties?: Record<string, string | number | boolean>;
  occurredAt?: string;
}

export const contactEventsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: ContactId }; Body: EventBody }>(
    "/contacts/:id/events",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "contacts_access")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "contacts_access required" } });
      }
      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId, deletedAt: null },
      });
      if (!contact) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }
      const event = await fastify.prisma.contactEvent.create({
        data: {
          organizationId,
          contactId: contact.id,
          name: request.body.name,
          properties: (request.body.properties ?? {}) as object,
          ...(request.body.occurredAt ? { occurredAt: new Date(request.body.occurredAt) } : {}),
        },
      });
      return reply.status(201).send({ data: event });
    }
  );

  fastify.get("/contacts/events/names", async (request, reply) => {
    const { organizationId } = request.auth;
    const rows = await fastify.prisma.contactEvent.groupBy({
      by: ["name"],
      where: { organizationId },
    });
    const names = rows.map((r) => r.name).sort();
    return reply.send({ data: names });
  });

  fastify.get<{ Params: { name: string } }>(
    "/contacts/events/:name/properties",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const events = await fastify.prisma.contactEvent.findMany({
        where: { organizationId, name: request.params.name },
        select: { properties: true },
        take: 200,
      });
      const keySet = new Set<string>();
      for (const ev of events) {
        const props = ev.properties as Record<string, unknown>;
        for (const key of Object.keys(props)) keySet.add(key);
      }
      return reply.send({ data: Array.from(keySet).sort() });
    }
  );
};
```

- [ ] **Step 4: Register the router**

Find the file where routes are registered (likely `apps/api/src/index.ts` or `apps/api/src/app.ts`). Add:

```ts
import { contactEventsRouter } from "./routes/contact-events.js";
// ...
await app.register(contactEventsRouter, { prefix: "/v1" });
```

Check existing registrations to confirm the file and pattern:
```bash
grep -rn "register.*Router\|register.*router" apps/api/src/index.ts apps/api/src/app.ts 2>/dev/null | head -10
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose contact-events
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/contact-events.ts apps/api/src/routes/contact-events.test.ts apps/api/src/index.ts
git commit -m "feat(events): add contact events API routes"
```

---

## Task 3: Update segment evaluator — events branch

**Files:**
- Modify: `apps/api/src/lib/segment-evaluator.ts`
- Modify: `apps/api/src/lib/segment-evaluator.test.ts`

**Interfaces:**
- Consumes: `EventsRule`, `EventSubCondition` from existing type definitions in the same file
- Produces: updated `evaluateSegment` that handles `EventsRule`

- [ ] **Step 1: Write failing test**

Add to `apps/api/src/lib/segment-evaluator.test.ts`:

```ts
describe("evaluateSegment — events rules", () => {
  it("evaluates EventsRule hasDone with no sub-conditions", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      {
        type: "events",
        action: "hasDone",
        eventName: "flow_completed",
        subConditions: [],
        subMatch: "and",
      },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ contactEvents: { some: { organizationId: "org-1", name: "flow_completed" } } }],
      }),
    }));
  });

  it("evaluates EventsRule with sub-condition", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      {
        type: "events",
        action: "hasDone",
        eventName: "flow_completed",
        subConditions: [{ property: "flowId", operator: "is", value: "f-1" }],
        subMatch: "and",
      },
    ], "all");
    const call = mockFindMany.mock.calls[0][0];
    const eventClause = call.where.AND[0];
    expect(eventClause.contactEvents.some.name).toBe("flow_completed");
    expect(eventClause.contactEvents.some.AND).toBeDefined();
  });
});
```

Also add `contactEvent: { findMany: vi.fn() }` to `mockPrisma` at the top of the test file.

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segment-evaluator
```

Expected: FAIL — events clause returns `{}`.

- [ ] **Step 3: Add events branch to `segment-evaluator.ts`**

In `apps/api/src/lib/segment-evaluator.ts`, replace the `buildClause` function's `events` case:

```ts
function buildSubConditionClause(sub: EventSubCondition): Record<string, unknown> {
  // properties are stored as JSON — we query via path operator
  // Prisma JSON path filter: { path: ["property"], string_contains: value }
  const jsonPath = ["properties", sub.property];
  switch (sub.operator) {
    case "is":
      return { properties: { path: jsonPath, equals: sub.value } };
    case "isNot":
      return { NOT: { properties: { path: jsonPath, equals: sub.value } } };
    case "contains":
      return { properties: { path: jsonPath, string_contains: sub.value } };
    case "doesNotContain":
      return { NOT: { properties: { path: jsonPath, string_contains: sub.value } } };
    case "isEmpty":
      return { NOT: { properties: { path: jsonPath, not: null } } };
    case "hasAnyValue":
      return { properties: { path: jsonPath, not: null } };
    default:
      return {};
  }
}

function buildEventsClause(rule: EventsRule, organizationId: string): Record<string, unknown> {
  const subClauses = rule.subConditions
    .map(buildSubConditionClause)
    .filter((c) => Object.keys(c).length > 0);
  const subMatchKey = rule.subMatch === "or" ? "OR" : "AND";

  return {
    contactEvents: {
      some: {
        organizationId,
        name: rule.eventName,
        ...(subClauses.length > 0 ? { [subMatchKey]: subClauses } : {}),
      },
    },
  };
}
```

Update `buildClause` to accept `organizationId` and call `buildEventsClause`:

```ts
function buildClause(rule: FilterRule, organizationId: string): Record<string, unknown> {
  switch (rule.type) {
    case "tags":    return buildTagsClause(rule);
    case "fields":  return buildFieldsClause(rule);
    case "events":  return buildEventsClause(rule, organizationId);
  }
}
```

Update `evaluateSegment` to pass `organizationId` to `buildClause`:

```ts
const clauses = normalized
  .map((r) => buildClause(r, organizationId))
  .filter((c) => Object.keys(c).length > 0);
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segment-evaluator
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/segment-evaluator.ts apps/api/src/lib/segment-evaluator.test.ts
git commit -m "feat(segments): add events rule evaluation in segment evaluator"
```

---

## Task 4: Auto-log events from workers + webhook

**Files:**
- Modify: `apps/api/src/workers/flow-execution.worker.ts`
- Modify: `apps/api/src/workers/campaign-dispatch.worker.ts`
- Modify: WhatsApp webhook handler (find via grep below)

**Interfaces:**
- Produces: `ContactEvent` rows created automatically when flows run, campaigns send, and delivery statuses arrive

- [ ] **Step 1: Find the WhatsApp webhook handler**

```bash
grep -rn "status.*delivered\|status.*read\|wamid\|statuses" apps/api/src/routes/ apps/api/src/workers/ --include="*.ts" -l
```

Note the file path — it handles WhatsApp delivery status callbacks.

- [ ] **Step 2: Add event logging to flow-execution worker**

In `apps/api/src/workers/flow-execution.worker.ts`, find where a flow starts and where it ends. Add event creation after each. The prisma client is available via the worker's context (check how it's imported — likely `import { prisma } from "../lib/prisma.js"`).

At flow start:
```ts
await prisma.contactEvent.create({
  data: {
    organizationId: job.data.organizationId,
    contactId: job.data.contactId,
    name: "flow_started",
    properties: { flowId: job.data.flowId, flowName: job.data.flowName ?? "" },
  },
}).catch(() => undefined); // non-fatal — never block flow execution
```

At flow completion:
```ts
await prisma.contactEvent.create({
  data: {
    organizationId: job.data.organizationId,
    contactId: job.data.contactId,
    name: "flow_completed",
    properties: { flowId: job.data.flowId, flowName: job.data.flowName ?? "" },
  },
}).catch(() => undefined);
```

- [ ] **Step 3: Add event logging to campaign-dispatch worker**

In `apps/api/src/workers/campaign-dispatch.worker.ts`, find where a message is sent to a contact. After the send succeeds, add:

```ts
await prisma.contactEvent.create({
  data: {
    organizationId: recipient.organizationId,
    contactId: recipient.contactId,
    name: "campaign_sent",
    properties: { campaignId: job.data.campaignId, campaignName: job.data.campaignName ?? "" },
  },
}).catch(() => undefined);
```

- [ ] **Step 4: Add event logging to WhatsApp webhook handler**

In the webhook handler (identified in Step 1), find where delivery status is processed. Add:

```ts
// When status === "delivered"
if (status === "delivered") {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { wamid: messageId, organizationId },
    select: { contactId: true, campaign: { select: { id: true } } },
  });
  if (recipient) {
    await prisma.contactEvent.create({
      data: {
        organizationId,
        contactId: recipient.contactId,
        name: "campaign_delivered",
        properties: { campaignId: recipient.campaign.id },
      },
    }).catch(() => undefined);
  }
}

// When status === "read"
if (status === "read") {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { wamid: messageId, organizationId },
    select: { contactId: true, campaign: { select: { id: true } } },
  });
  if (recipient) {
    await prisma.contactEvent.create({
      data: {
        organizationId,
        contactId: recipient.contactId,
        name: "campaign_read",
        properties: { campaignId: recipient.campaign.id },
      },
    }).catch(() => undefined);
  }
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/workers/ apps/api/src/routes/
git commit -m "feat(events): auto-log flow and campaign events from workers"
```

---

## Task 5: Events tab in SegmentBuilderV2

**Files:**
- Modify: `apps/web/components/segments/SegmentBuilderV2.tsx`

**Interfaces:**
- Consumes: `GET /v1/contacts/events/names`, `GET /v1/contacts/events/:name/properties`
- Produces: fully functional Events tab with sub-condition rows

- [ ] **Step 1: Replace `EventsPlaceholder` with `EventsRowContent`**

In `apps/web/components/segments/SegmentBuilderV2.tsx`:

1. Remove the `EventsPlaceholder` function.

2. Add the `EventsRowContent` component:

```tsx
function EventsRowContent({
  rule,
  eventNames,
  getEventProperties,
  onChange,
}: {
  rule: import("./types").EventsRule;
  eventNames: DropdownOption[];
  getEventProperties: (name: string) => DropdownOption[];
  onChange: (r: import("./types").EventsRule) => void;
}): JSX.Element {
  const SUB_OPERATORS: DropdownOption[] = [
    { value: "is",             label: "Is" },
    { value: "isNot",          label: "Is not" },
    { value: "contains",       label: "Contains" },
    { value: "doesNotContain", label: "Does not contain" },
    { value: "isEmpty",        label: "Is empty" },
    { value: "hasAnyValue",    label: "Has any value" },
  ];

  const propertyOptions = getEventProperties(rule.eventName);

  function addSub(): void {
    onChange({
      ...rule,
      subConditions: [
        ...rule.subConditions,
        { property: "", operator: "is", value: "" },
      ],
    });
  }

  function updateSub(i: number, patch: Partial<import("./types").EventSubCondition>): void {
    onChange({
      ...rule,
      subConditions: rule.subConditions.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  }

  function removeSub(i: number): void {
    onChange({
      ...rule,
      subConditions: rule.subConditions.filter((_, idx) => idx !== i),
    });
  }

  const needsSubValue = (op: string) => !["isEmpty", "hasAnyValue"].includes(op);

  return (
    <div className="space-y-3">
      {/* Event action + name */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 font-medium">
          Has Done
        </span>
        <span className="text-gray-300 text-lg">·········</span>
        <Dropdown
          options={eventNames}
          value={rule.eventName}
          onChange={(v) => onChange({ ...rule, eventName: v, subConditions: [] })}
          placeholder="Select Event Name"
          searchable
          className="w-52"
        />
      </div>

      {/* Sub-conditions */}
      {rule.subConditions.map((sub, i) => (
        <div key={i} className="flex items-center gap-3 pl-8 flex-wrap">
          {/* With / AND / OR label */}
          {i === 0 ? (
            <span className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              With
            </span>
          ) : (
            <Dropdown
              options={[{ value: "and", label: "AND" }, { value: "or", label: "OR" }]}
              value={rule.subMatch}
              onChange={(v) => onChange({ ...rule, subMatch: v as "and" | "or" })}
              className="w-20"
            />
          )}
          <span className="text-gray-300 text-lg">·········</span>
          <Dropdown
            options={propertyOptions}
            value={sub.property}
            onChange={(v) => updateSub(i, { property: v })}
            placeholder="Select Property"
            className="w-40"
          />
          <span className="text-gray-300 text-lg">·········</span>
          <Dropdown
            options={SUB_OPERATORS}
            value={sub.operator}
            onChange={(v) => updateSub(i, { operator: v as import("./types").EventSubCondition["operator"], value: "" })}
            className="w-40"
          />
          {needsSubValue(sub.operator) && (
            <>
              <span className="text-gray-300 text-lg">·········</span>
              <input
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
                placeholder="Enter a value"
                value={sub.value ?? ""}
                onChange={(e) => updateSub(i, { value: e.target.value })}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => removeSub(i)}
            className="text-red-400 hover:text-red-600"
            aria-label="Remove sub-condition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Add condition within event */}
      <button
        type="button"
        onClick={addSub}
        className="flex items-center gap-2 text-sm text-[#1D4B3E] hover:text-green-700 pl-8"
      >
        <PlusCircle className="h-4 w-4" />
        Add Condition within Event
      </button>
    </div>
  );
}
```

3. Add state and fetching for event names and properties in `SegmentBuilderV2`:

Add to the existing `useEffect` that fetches tags/statuses/customFields:

```ts
const [eventNames, setEventNames] = useState<DropdownOption[]>([]);
const [eventProperties, setEventProperties] = useState<Record<string, DropdownOption[]>>({});
```

In the `useEffect`:
```ts
const eventsRes = await fetch(`${API_URL}/v1/contacts/events/names`, { headers });
if (eventsRes.ok) {
  const body = (await eventsRes.json()) as { data: string[] };
  setEventNames(body.data.map((n) => ({ value: n, label: n.replace(/_/g, " ") })));
}
```

4. Add a helper to lazily fetch properties for an event name:

```ts
async function fetchEventProperties(name: string): Promise<void> {
  if (eventProperties[name]) return;
  const token = await getToken();
  const res = await fetch(`${API_URL}/v1/contacts/events/${encodeURIComponent(name)}/properties`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.ok) {
    const body = (await res.json()) as { data: string[] };
    setEventProperties((prev) => ({
      ...prev,
      [name]: body.data.map((p) => ({ value: p, label: p })),
    }));
  }
}

function getEventProperties(name: string): DropdownOption[] {
  if (name && !eventProperties[name]) {
    void fetchEventProperties(name);
  }
  return eventProperties[name] ?? [];
}
```

5. In the row render, replace `{row.tab === "events" && <EventsPlaceholder />}` with:

```tsx
{row.tab === "events" && (
  <EventsRowContent
    rule={row.rule as import("./types").EventsRule}
    eventNames={eventNames}
    getEventProperties={getEventProperties}
    onChange={(r) => updateRow(i, r)}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Run full API test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/segments/SegmentBuilderV2.tsx
git commit -m "feat(segments): enable Events tab in SegmentBuilderV2"
```

---

## Done — PR2 Checklist

- [ ] `ContactEvent` table exists in DB with correct indexes
- [ ] `POST /v1/contacts/:id/events` creates events scoped to org
- [ ] `GET /v1/contacts/events/names` returns distinct event names for org
- [ ] `GET /v1/contacts/events/:name/properties` returns property keys
- [ ] Segment evaluator builds correct `contactEvents: { some: { ... } }` clause for events rules
- [ ] Flow worker logs `flow_started` and `flow_completed`
- [ ] Campaign worker logs `campaign_sent`
- [ ] Webhook logs `campaign_delivered` and `campaign_read`
- [ ] Events tab in SegmentBuilderV2 shows event name dropdown + sub-conditions
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
- [ ] TypeScript clean: `pnpm --filter @WBMSG/web type-check`
