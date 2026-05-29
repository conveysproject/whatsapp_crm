# Flows — Visual Canvas Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub Flows UI with a WATI-grade three-panel visual canvas editor — node palette (left), ReactFlow canvas (center), config panel (right) — plus condition branching, flow run logs, full auto-replies CRUD, list page polish, and flow duplication.

**Architecture:** ReactFlow v11 (already installed) + dagre (installed) for auto-layout. FlowEditor is a client component driven by React state. The `[id]/page.tsx` is a server component that fetches the flow and renders FlowEditor. API gets duplicate + runs endpoints. FlowRun model (schema already committed) records every execution.

**Tech Stack:** Fastify 4 (API), Prisma (DB), ReactFlow v11 + dagre (canvas), Next.js 15 App Router, Clerk auth, Tailwind CSS. API tests: Vitest + `app.inject()`. API imports use `.js` extensions. Web imports do NOT.

---

## File Map

| File | Action |
|---|---|
| `apps/api/prisma/migrations/20260530_add_flow_runs/migration.sql` | Create |
| `apps/api/src/routes/flows.ts` | Modify — add duplicate + runs + _count |
| `apps/api/src/routes/flows.test.ts` | Modify — add tests for new endpoints |
| `apps/api/src/lib/flow-runner.ts` | Modify — FlowRun logging + condition node |
| `apps/web/components/flows/utils/layout.ts` | Create |
| `apps/web/components/flows/utils/serialize.ts` | Create |
| `apps/web/components/flows/nodes/TriggerNode.tsx` | Rewrite |
| `apps/web/components/flows/nodes/ActionNode.tsx` | Rewrite |
| `apps/web/components/flows/nodes/ConditionNode.tsx` | Create |
| `apps/web/components/flows/FlowNodePalette.tsx` | Create |
| `apps/web/components/flows/FlowConfigPanel.tsx` | Create |
| `apps/web/components/flows/FlowEditor.tsx` | Create |
| `apps/web/components/flows/FlowLogsTab.tsx` | Create |
| `apps/web/app/(dashboard)/flows/[id]/page.tsx` | Rewrite |
| `apps/web/app/(dashboard)/flows/page.tsx` | Rewrite |
| `apps/web/app/(dashboard)/flows/auto-replies-section.tsx` | Rewrite |

---

## Task 1: DB Push — Apply FlowRun Schema

**Files:**
- Create: `apps/api/prisma/migrations/20260530_add_flow_runs/migration.sql`
- Run commands in `apps/api`

The schema already has the `FlowRun` model and `Prisma generate` ran successfully. This task syncs the DB and tracks the migration.

- [ ] **Step 1: Push schema to DB**

```bash
cd apps/api
npx prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 2: Create the migration SQL file**

Create `apps/api/prisma/migrations/20260530_add_flow_runs/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS flow_runs (
  id               VARCHAR(36)  NOT NULL,
  organization_id  VARCHAR(36)  NOT NULL,
  flow_id          VARCHAR(36)  NOT NULL,
  contact_phone    VARCHAR(50),
  conversation_id  VARCHAR(36),
  status           VARCHAR(20)  NOT NULL DEFAULT 'completed',
  steps_executed   INTEGER      NOT NULL DEFAULT 0,
  error            TEXT,
  started_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at     TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT flow_runs_flow_id_fkey
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS flow_runs_org_flow_idx
  ON flow_runs(organization_id, flow_id);
```

- [ ] **Step 3: Register migration as applied**

```bash
npx prisma migrate resolve --applied 20260530_add_flow_runs
```

Expected: `Migration 20260530_add_flow_runs marked as applied.`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/migrations/20260530_add_flow_runs/migration.sql
git commit -m "chore(api): track FlowRun migration as applied"
```

---

## Task 2: API — Duplicate + Runs Endpoints + _count on List

**Files:**
- Modify: `apps/api/src/routes/flows.ts`

- [ ] **Step 1: Replace `GET /flows` to include run count**

In `apps/api/src/routes/flows.ts`, replace the existing `GET /flows` handler:

```typescript
fastify.get("/flows", async (request, reply) => {
  const { organizationId } = request.auth;
  const flows = await fastify.prisma.flow.findMany({
    where: { organizationId },
    include: { _count: { select: { runs: true } } },
    orderBy: { createdAt: "desc" },
  });
  return reply.send({ data: flows });
});
```

- [ ] **Step 2: Add `POST /flows/:id/duplicate`**

Add after the existing `DELETE /flows/:id` handler in `apps/api/src/routes/flows.ts`:

```typescript
fastify.post<{ Params: { id: string } }>("/flows/:id/duplicate", async (request, reply) => {
  const { organizationId } = request.auth;
  const original = await fastify.prisma.flow.findFirst({
    where: { id: request.params.id, organizationId },
  });
  if (!original) {
    return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
  }
  const copy = await fastify.prisma.flow.create({
    data: {
      organizationId,
      name: `Copy of ${original.name}`,
      triggerType: original.triggerType,
      isActive: false,
      flowDefinition: original.flowDefinition as object,
    },
  });
  return reply.status(201).send({ data: copy });
});
```

- [ ] **Step 3: Add `GET /flows/:id/runs`**

Add after the duplicate endpoint:

```typescript
fastify.get<{
  Params: { id: string };
  Querystring: { limit?: string; cursor?: string };
}>("/flows/:id/runs", async (request, reply) => {
  const { organizationId } = request.auth;
  const flow = await fastify.prisma.flow.findFirst({
    where: { id: request.params.id, organizationId },
  });
  if (!flow) {
    return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
  }
  const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 100);
  const cursor = request.query.cursor;
  const runs = await fastify.prisma.flowRun.findMany({
    where: { flowId: request.params.id, organizationId },
    orderBy: { startedAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const nextCursor = runs.length === limit ? (runs[runs.length - 1]?.id ?? null) : null;
  return reply.send({ data: runs, nextCursor });
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/flows.ts
git commit -m "feat(api): add flow duplicate + run log endpoints"
```

---

## Task 3: API Tests for New Endpoints

**Files:**
- Modify: `apps/api/src/routes/flows.test.ts`

The existing test file has a single `describe` block. Add a new mock for `flowRun` and two new `describe` blocks.

- [ ] **Step 1: Add `flowRun` to `mockPrisma`**

In `apps/api/src/routes/flows.test.ts`, replace the `mockPrisma` declaration:

```typescript
const mockPrisma = {
  flow: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  flowRun: {
    findMany: vi.fn(),
  },
  vendorSetting: { findFirst: vi.fn().mockResolvedValue(null) },
};
```

- [ ] **Step 2: Add duplicate test**

Append to the end of `apps/api/src/routes/flows.test.ts`:

```typescript
describe("POST /v1/flows/:id/duplicate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when flow not found", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/flows/missing/duplicate" });
    expect(res.statusCode).toBe(404);
  });

  it("creates a copy with name prefixed and isActive false", async () => {
    const original = {
      id: "flow-1",
      organizationId: "org-1",
      name: "My Flow",
      triggerType: "new_conversation",
      isActive: true,
      flowDefinition: { startNodeId: "n1", nodes: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const copy = { ...original, id: "flow-2", name: "Copy of My Flow", isActive: false };
    mockPrisma.flow.findFirst.mockResolvedValue(original);
    mockPrisma.flow.create.mockResolvedValue(copy);

    const res = await app.inject({ method: "POST", url: "/v1/flows/flow-1/duplicate" });

    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { name: string; isActive: boolean } }>().data.name).toBe("Copy of My Flow");
    expect(res.json<{ data: { name: string; isActive: boolean } }>().data.isActive).toBe(false);
  });
});

describe("GET /v1/flows/:id/runs", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when flow not found", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/flows/missing/runs" });
    expect(res.statusCode).toBe(404);
  });

  it("returns paginated run list", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue({ id: "flow-1" });
    mockPrisma.flowRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        flowId: "flow-1",
        organizationId: "org-1",
        contactPhone: "919900000001",
        conversationId: "conv-1",
        status: "completed",
        stepsExecuted: 3,
        error: null,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ]);

    const res = await app.inject({ method: "GET", url: "/v1/flows/flow-1/runs" });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests and confirm all pass**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|flows"
```

Expected: all flows tests PASS (the pre-existing analytics timeout is unrelated).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/flows.test.ts
git commit -m "test(api): add duplicate and run-log endpoint tests"
```

---

## Task 4: flow-runner.ts — FlowRun Logging + Condition Node

**Files:**
- Modify: `apps/api/src/lib/flow-runner.ts`

- [ ] **Step 1: Extend `FlowNode` type and add condition + new node types**

Replace the `FlowNode` interface and `runFlow` signature in `apps/api/src/lib/flow-runner.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import { sendTextMessage, sendMediaMessage, sendInteractiveMessage, type WaInteractivePayload } from "./whatsapp.js";

export type TriggerType = "inbound_message" | "contact_tag_added" | "conversation_assigned";

export interface FlowNode {
  id: string;
  type:
    | "send_message" | "send_text"
    | "send_media" | "send_image" | "send_video" | "send_document"
    | "send_interactive" | "send_buttons" | "send_list"
    | "ask_question"
    | "update_stage"
    | "assign_conversation" | "assign_agent"
    | "add_tag" | "add_label"
    | "close_conversation"
    | "condition"
    | "wait"
    | "end";
  config: Record<string, unknown>;
  next: string | null;
  nextNo?: string | null;
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
```

- [ ] **Step 2: Rewrite `runFlow` with FlowRun logging**

Replace the entire `runFlow` function:

```typescript
export async function runFlow(
  prisma: PrismaClient,
  flowDefinition: FlowDefinition,
  payload: FlowTriggerPayload
): Promise<void> {
  const run = await prisma.flowRun.create({
    data: {
      organizationId: payload.organizationId,
      flowId: (await prisma.flow.findFirst({ where: { organizationId: payload.organizationId }, select: { id: true } }))?.id ?? "",
      contactPhone: payload.contactPhone ?? null,
      conversationId: payload.conversationId,
      status: "running",
    },
  });

  const nodeMap = new Map<string, FlowNode>(flowDefinition.nodes.map((n) => [n.id, n]));
  const org = await prisma.organization.findUnique({
    where: { id: payload.organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
  const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";

  let currentNodeId: string | null = flowDefinition.startNodeId;
  let stepsExecuted = 0;

  try {
    while (currentNodeId) {
      const node = nodeMap.get(currentNodeId);
      if (!node) break;

      let resolvedNext: string | null = node.next;

      switch (node.type) {
        case "send_message":
        case "send_text": {
          const text = (node.config["text"] as string) ?? "";
          if (payload.contactPhone && text) {
            await sendTextMessage(phoneNumberId, payload.contactPhone, text, accessToken);
          }
          break;
        }
        case "send_media":
        case "send_image":
        case "send_video":
        case "send_document": {
          const mediaId = (node.config["mediaId"] as string) ?? (node.config["url"] as string) ?? "";
          const contentType = (node.config["contentType"] as string) ?? node.type.replace("send_", "") ?? "image";
          const caption = node.config["caption"] as string | undefined;
          if (payload.contactPhone && mediaId) {
            await sendMediaMessage(phoneNumberId, payload.contactPhone, contentType, mediaId, caption, accessToken);
          }
          break;
        }
        case "send_interactive":
        case "send_buttons": {
          const interactive = node.config["interactive"] as WaInteractivePayload | undefined;
          if (payload.contactPhone && interactive) {
            await sendInteractiveMessage(phoneNumberId, payload.contactPhone, interactive, accessToken);
          }
          break;
        }
        case "send_list":
        case "ask_question":
          break;
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
        case "assign_conversation":
        case "assign_agent": {
          const assignTo = (node.config["assignTo"] as string) ?? "";
          if (assignTo) {
            await prisma.conversation.update({
              where: { id: payload.conversationId },
              data: { assignedTo: assignTo },
            });
          }
          break;
        }
        case "add_tag":
        case "add_label": {
          const tag = (node.config["tag"] as string) ?? "";
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
        case "close_conversation": {
          await prisma.conversation.update({
            where: { id: payload.conversationId },
            data: { status: "closed" },
          });
          break;
        }
        case "condition": {
          const conditionType = (node.config["conditionType"] as string) ?? "contains";
          const value = ((node.config["value"] as string) ?? "").toLowerCase();
          const messageBody = (payload.messageBody ?? "").toLowerCase();
          let matched = false;
          if (conditionType === "contains") matched = messageBody.includes(value);
          else if (conditionType === "is") matched = messageBody === value;
          else if (conditionType === "starts_with") matched = messageBody.startsWith(value);
          else if (conditionType === "ends_with") matched = messageBody.endsWith(value);
          resolvedNext = matched ? node.next : (node.nextNo ?? null);
          break;
        }
        case "wait":
          break;
        case "end":
          await prisma.flowRun.update({
            where: { id: run.id },
            data: { status: "completed", stepsExecuted, completedAt: new Date() },
          });
          return;
      }

      stepsExecuted++;
      currentNodeId = resolvedNext;
    }

    await prisma.flowRun.update({
      where: { id: run.id },
      data: { status: "completed", stepsExecuted, completedAt: new Date() },
    });
  } catch (err) {
    await prisma.flowRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        stepsExecuted,
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}
```

**Note:** The `flowRun.create` at the top needs the actual `flowId`. The worker passes `flowId` in the job; update the `runFlow` signature to accept `flowId` explicitly:

Replace the `runFlow` signature line:
```typescript
export async function runFlow(
  prisma: PrismaClient,
  flowId: string,
  flowDefinition: FlowDefinition,
  payload: FlowTriggerPayload
): Promise<void> {
```

And replace the `run` creation:
```typescript
const run = await prisma.flowRun.create({
  data: {
    organizationId: payload.organizationId,
    flowId,
    contactPhone: payload.contactPhone ?? null,
    conversationId: payload.conversationId,
    status: "running",
  },
});
```

Remove the `findFirst` for org id (it's now passed explicitly).

- [ ] **Step 3: Update `flow.worker.ts` to pass flowId**

Open `apps/api/src/workers/flow.worker.ts` and replace:

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { runFlow, type FlowDefinition, type FlowTriggerPayload } from "../lib/flow-runner.js";

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
    await runFlow(prisma, flowId, flow.flowDefinition as unknown as FlowDefinition, payload);
  },
  { connection: redisConnection }
);
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/flow-runner.ts apps/api/src/workers/flow.worker.ts
git commit -m "feat(api): flow-runner logs FlowRun records + handles condition + new node types"
```

---

## Task 5: `utils/layout.ts` — dagre Auto-layout

**Files:**
- Create: `apps/web/components/flows/utils/layout.ts`

- [ ] **Step 1: Create the file**

```typescript
import dagre from "dagre";
import type { Node, Edge } from "reactflow";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 90;

export function getLayoutedElements(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const nodeWithPosition = g.node(n.id);
    return {
      ...n,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/utils/layout.ts
git commit -m "feat(web): add dagre auto-layout util for flow canvas"
```

---

## Task 6: `utils/serialize.ts` — FlowDefinition ↔ ReactFlow Conversion

**Files:**
- Create: `apps/web/components/flows/utils/serialize.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { Node, Edge } from "reactflow";

export interface FlowNodeDef {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next: string | null;
  nextNo?: string | null;
}

export interface FlowDefinition {
  startNodeId: string;
  nodes: FlowNodeDef[];
}

export interface FlowData {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  flowDefinition: FlowDefinition;
}

export function getLabelFromConfig(nodeType: string, config: Record<string, unknown>): string {
  const str = (k: string) => (config[k] as string | undefined) ?? "";
  switch (nodeType) {
    case "send_message":
    case "send_text":        return str("text").slice(0, 50) || "Send Text";
    case "send_image":       return str("caption").slice(0, 50) || "Send Image";
    case "send_video":       return str("caption").slice(0, 50) || "Send Video";
    case "send_document":    return str("filename").slice(0, 50) || "Send Document";
    case "send_media":       return str("caption").slice(0, 50) || "Send Media";
    case "send_buttons":
    case "send_interactive": return str("body").slice(0, 50) || "Send Buttons";
    case "send_list":        return str("header").slice(0, 50) || "Send List";
    case "ask_question":     return str("question").slice(0, 50) || "Ask Question";
    case "wait":             return `Wait ${config["duration"] ?? 1} ${config["unit"] ?? "hours"}`;
    case "add_tag":
    case "add_label":        return str("tag") ? `Add label: ${str("tag")}` : "Add Label";
    case "update_stage":     return str("lifecycleStage") ? `Set stage: ${str("lifecycleStage")}` : "Update Stage";
    case "assign_agent":
    case "assign_conversation": return str("assignTo") ? `Assign to: ${str("assignTo")}` : "Assign Agent";
    case "close_conversation":  return "Close Conversation";
    case "condition":        return `If ${str("conditionType") || "contains"}: "${str("value")}"`;
    case "end":              return "End Flow";
    default:                 return nodeType.replace(/_/g, " ");
  }
}

export function getDefaultConfig(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case "send_text":
    case "send_message":        return { text: "" };
    case "send_image":          return { url: "", caption: "" };
    case "send_video":          return { url: "", caption: "" };
    case "send_document":       return { url: "", filename: "" };
    case "send_media":          return { mediaId: "", contentType: "image", caption: "" };
    case "send_buttons":
    case "send_interactive":    return { body: "", buttons: [{ id: "btn_1", text: "Option 1" }] };
    case "send_list":           return { header: "", items: [{ title: "Item 1", description: "" }] };
    case "ask_question":        return { question: "", saveToVariable: "" };
    case "condition":           return { conditionType: "contains", value: "" };
    case "wait":                return { duration: 1, unit: "hours" };
    case "add_label":
    case "add_tag":             return { tag: "" };
    case "update_stage":        return { lifecycleStage: "lead" };
    case "assign_agent":
    case "assign_conversation": return { assignTo: "" };
    case "close_conversation":  return {};
    case "end":                 return {};
    default:                    return {};
  }
}

export function deserializeFlow(flow: FlowData): { nodes: Node[]; edges: Edge[] } {
  const { nodes: flowNodes, startNodeId } = flow.flowDefinition;

  const nodes: Node[] = (flowNodes ?? []).map((fn, index) => {
    const isStart = fn.id === startNodeId;
    const reactFlowType = isStart ? "trigger" : fn.type === "condition" ? "condition" : "action";
    return {
      id: fn.id,
      type: reactFlowType,
      position: { x: 200, y: index * 150 },
      data: {
        nodeType: fn.type,
        triggerType: isStart ? flow.triggerType : undefined,
        config: fn.config ?? {},
        label: isStart
          ? flow.triggerType.replace(/_/g, " ")
          : getLabelFromConfig(fn.type, fn.config ?? {}),
      },
      deletable: !isStart,
    };
  });

  const edges: Edge[] = [];
  (flowNodes ?? []).forEach((fn) => {
    if (fn.next) {
      edges.push({
        id: `e-${fn.id}-yes`,
        source: fn.id,
        target: fn.next,
        sourceHandle: fn.type === "condition" ? "yes" : undefined,
        animated: flow.isActive,
        style: { stroke: "#16a34a", strokeWidth: 2 },
        type: "smoothstep",
      });
    }
    if (fn.type === "condition" && fn.nextNo) {
      edges.push({
        id: `e-${fn.id}-no`,
        source: fn.id,
        target: fn.nextNo,
        sourceHandle: "no",
        animated: flow.isActive,
        style: { stroke: "#ef4444", strokeWidth: 2 },
        type: "smoothstep",
        label: "No",
      });
    }
  });

  return { nodes, edges };
}

export function serializeFlow(nodes: Node[], edges: Edge[]): FlowDefinition {
  const startNode = nodes.find((n) => n.type === "trigger");
  const startNodeId = startNode?.id ?? nodes[0]?.id ?? "";

  const flowNodes: FlowNodeDef[] = nodes.map((n) => {
    const outEdges = edges.filter((e) => e.source === n.id);
    const yesEdge = outEdges.find((e) => e.sourceHandle === "yes" || !e.sourceHandle);
    const noEdge = outEdges.find((e) => e.sourceHandle === "no");
    const nodeType = (n.data.nodeType as string) ?? n.type ?? "end";

    return {
      id: n.id,
      type: nodeType,
      config: (n.data.config as Record<string, unknown>) ?? {},
      next: yesEdge?.target ?? null,
      ...(n.type === "condition" ? { nextNo: noEdge?.target ?? null } : {}),
    };
  });

  return { startNodeId, nodes: flowNodes };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/utils/serialize.ts
git commit -m "feat(web): add FlowDefinition serialization util"
```

---

## Task 7: Redesign `TriggerNode.tsx`

**Files:**
- Rewrite: `apps/web/components/flows/nodes/TriggerNode.tsx`

- [ ] **Step 1: Rewrite**

```typescript
"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface TriggerNodeData {
  triggerType: string;
  label: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation Starts",
  keyword_match:    "Keyword Matched",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

export function TriggerNode({ data, selected }: NodeProps<TriggerNodeData>): JSX.Element {
  return (
    <div
      className={[
        "w-[280px] rounded-xl overflow-hidden shadow-card transition-all",
        selected ? "ring-2 ring-brand-500 ring-offset-2" : "",
      ].join(" ")}
    >
      <div className="bg-brand-600 px-4 py-2 flex items-center gap-2">
        <span className="text-base leading-none">⚡</span>
        <span className="text-xs font-bold text-white uppercase tracking-widest">Trigger</span>
      </div>
      <div className="bg-white px-4 py-3 border border-brand-200 border-t-0 rounded-b-xl">
        <p className="text-sm font-medium text-gray-900">
          {TRIGGER_LABELS[data.triggerType] ?? data.triggerType.replace(/_/g, " ")}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-brand-500 !border-2 !border-white"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/nodes/TriggerNode.tsx
git commit -m "feat(web): redesign TriggerNode — brand-green header, WATI style"
```

---

## Task 8: Redesign `ActionNode.tsx`

**Files:**
- Rewrite: `apps/web/components/flows/nodes/ActionNode.tsx`

- [ ] **Step 1: Rewrite**

```typescript
"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface ActionNodeData {
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

const NODE_META: Record<string, { icon: string; label: string; color: string }> = {
  send_message:         { icon: "💬", label: "Send Text",       color: "#3B82F6" },
  send_text:            { icon: "💬", label: "Send Text",       color: "#3B82F6" },
  send_image:           { icon: "🖼️",  label: "Send Image",      color: "#06B6D4" },
  send_video:           { icon: "🎬", label: "Send Video",      color: "#06B6D4" },
  send_document:        { icon: "📎", label: "Send Document",   color: "#64748B" },
  send_media:           { icon: "🖼️",  label: "Send Media",      color: "#06B6D4" },
  send_buttons:         { icon: "🔘", label: "Send Buttons",    color: "#6366F1" },
  send_interactive:     { icon: "🔘", label: "Send Buttons",    color: "#6366F1" },
  send_list:            { icon: "📋", label: "Send List",       color: "#8B5CF6" },
  ask_question:         { icon: "❓", label: "Ask Question",    color: "#14B8A6" },
  wait:                 { icon: "⏱️",  label: "Wait / Delay",   color: "#F59E0B" },
  add_tag:              { icon: "🏷️",  label: "Add Label",       color: "#22C55E" },
  add_label:            { icon: "🏷️",  label: "Add Label",       color: "#22C55E" },
  update_stage:         { icon: "📈", label: "Update Stage",    color: "#A855F7" },
  assign_conversation:  { icon: "👤", label: "Assign Agent",    color: "#F97316" },
  assign_agent:         { icon: "👤", label: "Assign Agent",    color: "#F97316" },
  close_conversation:   { icon: "✅", label: "Close Chat",      color: "#EF4444" },
  end:                  { icon: "🔚", label: "End Flow",        color: "#6B7280" },
};

export function ActionNode({ data, selected }: NodeProps<ActionNodeData>): JSX.Element {
  const meta = NODE_META[data.nodeType] ?? { icon: "⚙️", label: data.nodeType.replace(/_/g, " "), color: "#6B7280" };

  return (
    <div
      className={[
        "w-[280px] rounded-xl bg-white shadow-card transition-all",
        "border border-gray-200",
        selected ? "ring-2 ring-brand-500 ring-offset-2" : "",
      ].join(" ")}
      style={{ borderLeft: `4px solid ${meta.color}` }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white"
      />
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="text-base leading-none">{meta.icon}</span>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{meta.label}</span>
      </div>
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-700 line-clamp-2 min-h-[1.25rem]">{data.label}</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/nodes/ActionNode.tsx
git commit -m "feat(web): redesign ActionNode — colored left-border, WATI style"
```

---

## Task 9: Create `ConditionNode.tsx`

**Files:**
- Create: `apps/web/components/flows/nodes/ConditionNode.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface ConditionNodeData {
  label: string;
  config: Record<string, unknown>;
}

export function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>): JSX.Element {
  return (
    <div
      className={[
        "w-[280px] rounded-xl bg-white shadow-card transition-all",
        "border border-gray-200",
        selected ? "ring-2 ring-brand-500 ring-offset-2" : "",
      ].join(" ")}
      style={{ borderLeft: "4px solid #6366F1" }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white"
      />
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="text-base leading-none">🔀</span>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Condition</span>
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-gray-700 line-clamp-2">{data.label}</p>
      </div>
      {/* Two output handles with labels */}
      <div className="relative flex justify-between px-6 pb-3">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-green-600 uppercase">Yes</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            style={{ position: "relative", transform: "none", left: "auto", bottom: "auto" }}
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white !static"
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold text-red-600 uppercase">No</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            style={{ position: "relative", transform: "none", left: "auto", bottom: "auto" }}
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white !static"
          />
        </div>
      </div>
    </div>
  );
}
```

**Note on handle positioning:** ReactFlow v11 positions handles absolutely by default. The `!static` + inline style override forces them to lay out naturally. If handles don't appear at the correct connection points in testing, replace the bottom section with:

```typescript
{/* Alternative: use left/right % positioning */}
<Handle type="source" position={Position.Bottom} id="yes" style={{ left: "28%" }} className="!w-3 !h-3 !bg-green-500 !border-2 !border-white" />
<Handle type="source" position={Position.Bottom} id="no" style={{ left: "72%" }} className="!w-3 !h-3 !bg-red-500 !border-2 !border-white" />
```

And add the "Yes" / "No" labels as absolutely positioned `<span>` elements above each handle using `style={{ left: "calc(28% - 12px)" }}`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/nodes/ConditionNode.tsx
git commit -m "feat(web): add ConditionNode with Yes/No output handles"
```

---

## Task 10: Create `FlowNodePalette.tsx`

**Files:**
- Create: `apps/web/components/flows/FlowNodePalette.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { JSX } from "react";

interface PaletteItem {
  type: string;
  icon: string;
  label: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation",
  keyword_match:    "Keyword Match",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

const ACTION_ITEMS: PaletteItem[] = [
  { type: "send_text",          icon: "💬", label: "Send Text" },
  { type: "send_image",         icon: "🖼️",  label: "Send Image" },
  { type: "send_video",         icon: "🎬", label: "Send Video" },
  { type: "send_document",      icon: "📎", label: "Send Document" },
  { type: "send_buttons",       icon: "🔘", label: "Send Buttons" },
  { type: "send_list",          icon: "📋", label: "Send List" },
  { type: "ask_question",       icon: "❓", label: "Ask Question" },
  { type: "condition",          icon: "🔀", label: "Condition" },
  { type: "wait",               icon: "⏱️",  label: "Wait / Delay" },
  { type: "add_label",          icon: "🏷️",  label: "Add Label" },
  { type: "update_stage",       icon: "📈", label: "Update Stage" },
  { type: "assign_agent",       icon: "👤", label: "Assign Agent" },
  { type: "close_conversation", icon: "✅", label: "Close Chat" },
  { type: "end",                icon: "🔚", label: "End Flow" },
];

interface FlowNodePaletteProps {
  triggerType: string;
  onAddNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

export function FlowNodePalette({ triggerType, onAddNode, onDragStart }: FlowNodePaletteProps): JSX.Element {
  return (
    <aside className="w-60 h-full bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
      <div className="px-4 py-4 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Trigger</p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 border border-brand-100">
          <span className="text-sm">⚡</span>
          <span className="text-sm font-medium text-brand-800 leading-tight">
            {TRIGGER_LABELS[triggerType] ?? triggerType.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 flex-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Actions</p>
        <div className="space-y-0.5">
          {ACTION_ITEMS.map((item) => (
            <button
              key={item.type}
              onClick={() => onAddNode(item.type)}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing group"
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/FlowNodePalette.tsx
git commit -m "feat(web): add FlowNodePalette left sidebar"
```

---

## Task 11: Create `FlowConfigPanel.tsx`

**Files:**
- Create: `apps/web/components/flows/FlowConfigPanel.tsx`

- [ ] **Step 1: Create the file** (write the full content below)

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import type { Node } from "reactflow";

interface FlowConfigPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

const NODE_META: Record<string, { icon: string; label: string }> = {
  trigger:              { icon: "⚡", label: "Trigger" },
  send_message:         { icon: "💬", label: "Send Text" },
  send_text:            { icon: "💬", label: "Send Text" },
  send_image:           { icon: "🖼️",  label: "Send Image" },
  send_video:           { icon: "🎬", label: "Send Video" },
  send_document:        { icon: "📎", label: "Send Document" },
  send_media:           { icon: "🖼️",  label: "Send Media" },
  send_buttons:         { icon: "🔘", label: "Send Buttons" },
  send_interactive:     { icon: "🔘", label: "Send Buttons" },
  send_list:            { icon: "📋", label: "Send List" },
  ask_question:         { icon: "❓", label: "Ask Question" },
  condition:            { icon: "🔀", label: "Condition" },
  wait:                 { icon: "⏱️",  label: "Wait / Delay" },
  add_label:            { icon: "🏷️",  label: "Add Label" },
  add_tag:              { icon: "🏷️",  label: "Add Label" },
  update_stage:         { icon: "📈", label: "Update Stage" },
  assign_agent:         { icon: "👤", label: "Assign Agent" },
  assign_conversation:  { icon: "👤", label: "Assign Agent" },
  close_conversation:   { icon: "✅", label: "Close Chat" },
  end:                  { icon: "🔚", label: "End Flow" },
};

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation Starts",
  keyword_match:    "Keyword Matched",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

const VARS = ["{{first_name}}", "{{last_name}}", "{{phone}}"];

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</p>;
}

function Field({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="space-y-1">{children}</div>;
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  );
}

function Textarea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }): JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function FlowConfigPanel({ node, onUpdate, onDelete, onClose }: FlowConfigPanelProps): JSX.Element | null {
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) setConfig((node.data.config as Record<string, unknown>) ?? {});
  }, [node?.id]);

  if (!node) return null;

  const nodeType: string = (node.data.nodeType as string) ?? node.type ?? "";
  const meta = NODE_META[nodeType] ?? { icon: "⚙️", label: nodeType };
  const isTrigger = node.type === "trigger";
  const str = (k: string) => (config[k] as string | undefined) ?? "";
  const num = (k: string, def = 1) => (config[k] as number | undefined) ?? def;

  function set(key: string, value: unknown): void {
    const next = { ...config, [key]: value };
    setConfig(next);
    onUpdate(node!.id, next);
  }

  function setBtn(index: number, field: string, value: string): void {
    const buttons = [...((config["buttons"] as { id: string; text: string }[]) ?? [])];
    buttons[index] = { ...buttons[index]!, [field]: value };
    set("buttons", buttons);
  }

  function addBtn(): void {
    const buttons = [...((config["buttons"] as { id: string; text: string }[]) ?? [])];
    if (buttons.length >= 3) return;
    buttons.push({ id: `btn_${buttons.length + 1}`, text: "" });
    set("buttons", buttons);
  }

  function removeBtn(index: number): void {
    const buttons = ((config["buttons"] as { id: string; text: string }[]) ?? []).filter((_, i) => i !== index);
    set("buttons", buttons);
  }

  function setItem(index: number, field: string, value: string): void {
    const items = [...((config["items"] as { title: string; description: string }[]) ?? [])];
    items[index] = { ...items[index]!, [field]: value };
    set("items", items);
  }

  function addItem(): void {
    const items = [...((config["items"] as { title: string; description: string }[]) ?? [])];
    if (items.length >= 10) return;
    items.push({ title: "", description: "" });
    set("items", items);
  }

  function removeItem(index: number): void {
    const items = ((config["items"] as { title: string; description: string }[]) ?? []).filter((_, i) => i !== index);
    set("items", items);
  }

  return (
    <aside className="w-80 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{meta.icon}</span>
          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ✕
        </button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* TRIGGER */}
        {isTrigger && (
          <Field>
            <Label>Trigger Type</Label>
            <p className="text-sm text-gray-900">
              {TRIGGER_LABELS[(node.data.triggerType as string) ?? ""] ?? (node.data.triggerType as string)}
            </p>
            <p className="text-xs text-gray-400">Trigger type is set when the flow is created.</p>
          </Field>
        )}

        {/* SEND TEXT */}
        {(nodeType === "send_text" || nodeType === "send_message") && (
          <>
            <Field>
              <Label>Message</Label>
              <Textarea value={str("text")} onChange={(v) => set("text", v)} rows={4} />
            </Field>
            <div className="flex flex-wrap gap-1">
              {VARS.map((v) => (
                <button
                  key={v}
                  onClick={() => set("text", str("text") + v)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-600 font-mono"
                >
                  {v}
                </button>
              ))}
            </div>
          </>
        )}

        {/* SEND IMAGE / VIDEO / DOCUMENT */}
        {(nodeType === "send_image" || nodeType === "send_video" || nodeType === "send_document" || nodeType === "send_media") && (
          <>
            <Field>
              <Label>{nodeType === "send_document" ? "Document URL or Media ID" : "Image/Video URL or Media ID"}</Label>
              <TextInput value={str("url") || str("mediaId")} onChange={(v) => set("url", v)} placeholder="https://... or media ID" />
            </Field>
            {nodeType === "send_document" ? (
              <Field>
                <Label>Filename</Label>
                <TextInput value={str("filename")} onChange={(v) => set("filename", v)} placeholder="document.pdf" />
              </Field>
            ) : (
              <Field>
                <Label>Caption (optional)</Label>
                <TextInput value={str("caption")} onChange={(v) => set("caption", v)} placeholder="Optional caption" />
              </Field>
            )}
          </>
        )}

        {/* SEND BUTTONS */}
        {(nodeType === "send_buttons" || nodeType === "send_interactive") && (
          <>
            <Field>
              <Label>Body Text</Label>
              <Textarea value={str("body")} onChange={(v) => set("body", v)} />
            </Field>
            <Field>
              <Label>Buttons (max 3)</Label>
              {((config["buttons"] as { id: string; text: string }[]) ?? []).map((btn, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <TextInput value={btn.text} onChange={(v) => setBtn(i, "text", v)} placeholder={`Button ${i + 1}`} />
                  <button onClick={() => removeBtn(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                </div>
              ))}
              {((config["buttons"] as unknown[]) ?? []).length < 3 && (
                <button onClick={addBtn} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add Button</button>
              )}
            </Field>
          </>
        )}

        {/* SEND LIST */}
        {nodeType === "send_list" && (
          <>
            <Field>
              <Label>Header</Label>
              <TextInput value={str("header")} onChange={(v) => set("header", v)} placeholder="Choose an option" />
            </Field>
            <Field>
              <Label>List Items (max 10)</Label>
              {((config["items"] as { title: string; description: string }[]) ?? []).map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1">
                  <div className="flex gap-2 items-center">
                    <TextInput value={item.title} onChange={(v) => setItem(i, "title", v)} placeholder={`Item ${i + 1} title`} />
                    <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                  </div>
                  <TextInput value={item.description} onChange={(v) => setItem(i, "description", v)} placeholder="Description (optional)" />
                </div>
              ))}
              {((config["items"] as unknown[]) ?? []).length < 10 && (
                <button onClick={addItem} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add Item</button>
              )}
            </Field>
          </>
        )}

        {/* ASK QUESTION */}
        {nodeType === "ask_question" && (
          <>
            <Field>
              <Label>Question</Label>
              <Textarea value={str("question")} onChange={(v) => set("question", v)} />
            </Field>
            <Field>
              <Label>Save reply to variable</Label>
              <TextInput value={str("saveToVariable")} onChange={(v) => set("saveToVariable", v)} placeholder="e.g. user_reply" />
            </Field>
          </>
        )}

        {/* CONDITION */}
        {nodeType === "condition" && (
          <>
            <Field>
              <Label>Condition Type</Label>
              <Select
                value={str("conditionType") || "contains"}
                onChange={(v) => set("conditionType", v)}
                options={[
                  { value: "contains",    label: "Message contains" },
                  { value: "is",          label: "Message is exactly" },
                  { value: "starts_with", label: "Message starts with" },
                  { value: "ends_with",   label: "Message ends with" },
                ]}
              />
            </Field>
            <Field>
              <Label>Value</Label>
              <TextInput value={str("value")} onChange={(v) => set("value", v)} placeholder="e.g. yes" />
            </Field>
            <p className="text-xs text-gray-400">Connect the Yes handle to the next step if matched; No handle for the else branch.</p>
          </>
        )}

        {/* WAIT */}
        {nodeType === "wait" && (
          <Field>
            <Label>Wait Duration</Label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={num("duration")}
                onChange={(e) => set("duration", parseInt(e.target.value, 10) || 1)}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <Select
                value={str("unit") || "hours"}
                onChange={(v) => set("unit", v)}
                options={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours",   label: "Hours" },
                  { value: "days",    label: "Days" },
                ]}
              />
            </div>
          </Field>
        )}

        {/* ADD LABEL */}
        {(nodeType === "add_label" || nodeType === "add_tag") && (
          <Field>
            <Label>Label Name</Label>
            <TextInput value={str("tag")} onChange={(v) => set("tag", v)} placeholder="e.g. interested" />
          </Field>
        )}

        {/* UPDATE STAGE */}
        {nodeType === "update_stage" && (
          <Field>
            <Label>Lifecycle Stage</Label>
            <Select
              value={str("lifecycleStage") || "lead"}
              onChange={(v) => set("lifecycleStage", v)}
              options={[
                { value: "lead",      label: "Lead" },
                { value: "prospect",  label: "Prospect" },
                { value: "customer",  label: "Customer" },
                { value: "loyal",     label: "Loyal" },
                { value: "churned",   label: "Churned" },
              ]}
            />
          </Field>
        )}

        {/* ASSIGN AGENT */}
        {(nodeType === "assign_agent" || nodeType === "assign_conversation") && (
          <Field>
            <Label>Assign to (User ID)</Label>
            <TextInput value={str("assignTo")} onChange={(v) => set("assignTo", v)} placeholder="User ID" />
          </Field>
        )}

        {/* CLOSE CONVERSATION */}
        {nodeType === "close_conversation" && (
          <p className="text-sm text-gray-500">This step closes the active conversation. No configuration needed.</p>
        )}

        {/* END */}
        {nodeType === "end" && (
          <p className="text-sm text-gray-500">Flow execution ends here. No further steps will run.</p>
        )}
      </div>

      {/* Footer — delete button */}
      {!isTrigger && (
        <div className="px-4 py-3 border-t border-gray-200">
          <button
            onClick={() => onDelete(node.id)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <span>🗑</span>
            <span>Delete this step</span>
          </button>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/FlowConfigPanel.tsx
git commit -m "feat(web): add FlowConfigPanel with all node type config forms"
```

---

## Task 12: Create `FlowLogsTab.tsx`

**Files:**
- Create: `apps/web/components/flows/FlowLogsTab.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { JSX } from "react";

interface FlowRun {
  id: string;
  contactPhone: string | null;
  conversationId: string | null;
  status: string;
  stepsExecuted: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface FlowLogsTabProps {
  runs: FlowRun[];
  loading: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const STATUS_CLASSES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  running:   "bg-blue-100 text-blue-700",
  failed:    "bg-red-100 text-red-700",
};

export function FlowLogsTab({ runs, loading }: FlowLogsTabProps): JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading run history…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-4xl">📋</span>
        <p className="text-sm text-gray-500">No runs yet. Activate the flow to start collecting history.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="pb-2 pr-4">Triggered</th>
            <th className="pb-2 pr-4">Contact</th>
            <th className="pb-2 pr-4">Steps</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-50">
              <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{timeAgo(run.startedAt)}</td>
              <td className="py-2 pr-4 font-mono text-gray-700">{run.contactPhone ?? "—"}</td>
              <td className="py-2 pr-4 text-gray-700">{run.stepsExecuted}</td>
              <td className="py-2 pr-4">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[run.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {run.status}
                </span>
              </td>
              <td className="py-2 text-xs text-red-500 truncate max-w-[200px]">{run.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/FlowLogsTab.tsx
git commit -m "feat(web): add FlowLogsTab component"
```

---

## Task 13: Create `FlowEditor.tsx` (Orchestrator)

**Files:**
- Create: `apps/web/components/flows/FlowEditor.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { JSX, useState, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { FlowNodePalette } from "./FlowNodePalette";
import { FlowConfigPanel } from "./FlowConfigPanel";
import { FlowLogsTab } from "./FlowLogsTab";
import { getLayoutedElements } from "./utils/layout";
import {
  deserializeFlow,
  serializeFlow,
  getDefaultConfig,
  getLabelFromConfig,
  type FlowData,
} from "./utils/serialize";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

interface FlowRun {
  id: string;
  contactPhone: string | null;
  conversationId: string | null;
  status: string;
  stepsExecuted: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function FlowEditor({ initialFlow }: { initialFlow: FlowData }): JSX.Element {
  const { getToken } = useAuth();

  const { nodes: initNodes, edges: initEdges } = deserializeFlow(initialFlow);
  const layoutedInit = getLayoutedElements(initNodes, initEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedInit);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [flowName, setFlowName] = useState(initialFlow.name);
  const [isActive, setIsActive] = useState(initialFlow.isActive);
  const [isToggling, setIsToggling] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"builder" | "logs">("builder");

  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const rfWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Ctrl+S / Escape keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); void handleSave(); }
      if (e.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, nodes, edges, flowName]);

  // Load logs when tab switches
  useEffect(() => {
    if (activeTab !== "logs") return;
    setLoadingRuns(true);
    getToken()
      .then((token) =>
        fetch(`${API_URL}/v1/flows/${initialFlow.id}/runs`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        })
      )
      .then((r) => r.json())
      .then((body) => setRuns((body as { data: FlowRun[] }).data))
      .catch(() => undefined)
      .finally(() => setLoadingRuns(false));
  }, [activeTab, initialFlow.id, getToken]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => setSelectedNodeId(node.id), []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          { ...params, animated: isActive, style: { stroke: "#16a34a", strokeWidth: 2 }, type: "smoothstep" },
          eds
        );
        setIsDirty(true);
        return next;
      });
    },
    [isActive, setEdges]
  );

  const handleAddNode = useCallback(
    (type: string) => {
      const id = `node-${Date.now()}`;
      const newNode: Node = {
        id,
        type: type === "condition" ? "condition" : "action",
        position: { x: 200, y: 0 },
        data: {
          nodeType: type,
          config: getDefaultConfig(type),
          label: getLabelFromConfig(type, getDefaultConfig(type)),
        },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        const laidOut = getLayoutedElements(updated, edges);
        return laidOut;
      });

      setEdges((eds) => {
        const lastNode = nodes[nodes.length - 1];
        if (!lastNode) return eds;
        const alreadyConnected = eds.some((e) => e.source === lastNode.id && !e.sourceHandle);
        if (alreadyConnected) return eds;
        return addEdge(
          {
            id: `e-${lastNode.id}-${id}`,
            source: lastNode.id,
            target: id,
            animated: isActive,
            style: { stroke: "#16a34a", strokeWidth: 2 },
            type: "smoothstep",
          },
          eds
        );
      });

      setIsDirty(true);
      setSelectedNodeId(id);
    },
    [nodes, edges, isActive, setNodes, setEdges]
  );

  const handleDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !rfWrapper.current || !rfInstance) return;
      const bounds = rfWrapper.current.getBoundingClientRect();
      const position = rfInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const id = `node-${Date.now()}`;
      const newNode: Node = {
        id,
        type: type === "condition" ? "condition" : "action",
        position,
        data: {
          nodeType: type,
          config: getDefaultConfig(type),
          label: getLabelFromConfig(type, getDefaultConfig(type)),
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
      setSelectedNodeId(id);
    },
    [rfInstance, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleConfigUpdate = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, config, label: getLabelFromConfig(n.data.nodeType as string, config) } }
            : n
        )
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setNodes((nds) => {
        const updated = nds.filter((n) => n.id !== nodeId);
        return getLayoutedElements(updated, edges.filter((e) => e.source !== nodeId && e.target !== nodeId));
      });
      setSelectedNodeId(null);
      setIsDirty(true);
    },
    [setNodes, setEdges, edges]
  );

  async function handleSave(): Promise<void> {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const token = await getToken();
      const flowDefinition = serializeFlow(nodes, edges);
      const res = await fetch(`${API_URL}/v1/flows/${initialFlow.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: flowName, flowDefinition }),
      });
      if (res.ok) setIsDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(): Promise<void> {
    setIsToggling(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/flows/${initialFlow.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (res.ok) {
        const nextActive = !isActive;
        setIsActive(nextActive);
        setEdges((eds) => eds.map((e) => ({ ...e, animated: nextActive })));
      }
    } finally {
      setIsToggling(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0 h-14">
        <Link href="/flows" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">
          ← Flows
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        {/* Inline editable flow name */}
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const n = e.currentTarget.textContent?.trim() ?? "";
            if (n && n !== flowName) { setFlowName(n); setIsDirty(true); }
          }}
          className="text-sm font-semibold text-gray-900 outline-none border-b border-transparent hover:border-gray-300 focus:border-brand-500 px-1 min-w-[80px] max-w-[260px] truncate"
        >
          {initialFlow.name}
        </span>
        {isDirty && (
          <span className="flex items-center gap-1 text-xs text-amber-600 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Unsaved
          </span>
        )}

        {/* Tab strip */}
        <div className="flex gap-1 ml-2 bg-gray-100 rounded-lg p-0.5">
          {(["builder", "logs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Save */}
        <button
          onClick={() => void handleSave()}
          disabled={!isDirty || saving}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {/* Active toggle */}
        <button
          onClick={() => void handleToggle()}
          disabled={isToggling}
          className={[
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
            isActive
              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
          ].join(" ")}
        >
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`} />
          {isToggling ? "…" : isActive ? "Active" : "Inactive"}
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      {activeTab === "builder" ? (
        <div className="flex flex-1 overflow-hidden">
          <FlowNodePalette
            triggerType={initialFlow.triggerType}
            onAddNode={handleAddNode}
            onDragStart={handleDragStart}
          />

          <div
            ref={rfWrapper}
            className="flex-1 h-full"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedNodeId(null)}
              onInit={setRfInstance}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              deleteKeyCode={null}
              className="bg-white"
            >
              <Background color="#E5E7EB" gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <FlowConfigPanel
            node={selectedNode}
            onUpdate={handleConfigUpdate}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        </div>
      ) : (
        <FlowLogsTab runs={runs} loading={loadingRuns} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/flows/FlowEditor.tsx
git commit -m "feat(web): add FlowEditor — three-panel WATI-style canvas orchestrator"
```

---

## Task 14: Rewrite `flows/[id]/page.tsx`

**Files:**
- Rewrite: `apps/web/app/(dashboard)/flows/[id]/page.tsx`

- [ ] **Step 1: Rewrite as server component**

```typescript
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { FlowEditor } from "@/components/flows/FlowEditor";
import type { FlowData } from "@/components/flows/utils/serialize";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default async function FlowEditorPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/flows/${params.id}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
    cache: "no-store",
  });

  if (!res.ok) notFound();

  const flow = (await res.json() as { data: FlowData }).data;

  return (
    <div className="-m-6 h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
      <FlowEditor initialFlow={flow} />
    </div>
  );
}
```

**Note on height:** The dashboard layout has a `h-14` (3.5rem = 56px) TopBar. Using `-m-6` cancels the `p-6` padding on `main`, and `h-[calc(100vh-3.5rem)]` fills the remaining viewport. If the SetupBanner is shown, the canvas will be slightly shorter — this is acceptable.

- [ ] **Step 2: Commit**

```bash
git add "apps/web/app/(dashboard)/flows/[id]/page.tsx"
git commit -m "feat(web): replace flow detail stub with full-screen FlowEditor"
```

---

## Task 15: Rewrite `flows/page.tsx` — Polished List Page

**Files:**
- Rewrite: `apps/web/app/(dashboard)/flows/page.tsx`

- [ ] **Step 1: Rewrite**

```typescript
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AutoRepliesSection } from "./auto-replies-section";
import { FlowListActions } from "./flow-list-actions";

interface Flow {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  createdAt: string;
  _count?: { runs: number };
}

async function getFlows(token: string): Promise<Flow[]> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    return res.ok ? (await res.json() as { data: Flow[] }).data : [];
  } catch {
    return [];
  }
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation",
  keyword_match:    "Keyword Match",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

export default async function FlowsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const flows = await getFlows(await getToken() ?? "");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Automation Flows</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {flows.length} flow{flows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/flows/new">
          <Button>+ New Flow</Button>
        </Link>
      </div>

      {/* Flow list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
        {flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-5xl">🔁</span>
            <p className="text-gray-500 text-sm">No flows yet. Create your first automation.</p>
            <Link href="/flows/new">
              <Button size="sm">+ New Flow</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {flows.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="min-w-0">
                    <Link
                      href={`/flows/${f.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate block"
                    >
                      {f.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {TRIGGER_LABELS[f.triggerType] ?? f.triggerType.replace(/_/g, " ")}
                      </span>
                      {(f._count?.runs ?? 0) > 0 && (
                        <span className="text-xs text-gray-400">· {f._count!.runs} runs</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={f.isActive ? "green" : "gray"}>
                    {f.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <FlowListActions flowId={f.id} flowName={f.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AutoRepliesSection />
    </div>
  );
}
```

- [ ] **Step 2: Create `flow-list-actions.tsx` (client component for duplicate + delete)**

Create `apps/web/app/(dashboard)/flows/flow-list-actions.tsx`:

```typescript
"use client";

import { JSX, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function FlowListActions({ flowId, flowName }: { flowId: string; flowName: string }): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function duplicate(): Promise<void> {
    setBusy(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/flows/${flowId}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete "${flowName}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/flows/${flowId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded"
        disabled={busy}
      >
        ···
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36">
            <button
              onClick={() => void duplicate()}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Duplicate
            </button>
            <button
              onClick={() => void remove()}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/flows/page.tsx" "apps/web/app/(dashboard)/flows/flow-list-actions.tsx"
git commit -m "feat(web): polish flows list page — run count, duplicate, delete, empty state"
```

---

## Task 16: Rewrite `auto-replies-section.tsx` — Full CRUD

**Files:**
- Rewrite: `apps/web/app/(dashboard)/flows/auto-replies-section.tsx`

- [ ] **Step 1: Rewrite with create + edit + delete modals**

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface AutoReply {
  id: string;
  name: string;
  triggerType: string;
  triggerKeyword: string;
  replyText: string;
  isActive: boolean;
}

type AutoReplyTriggerType = "contains" | "is" | "starts_with" | "ends_with" | "regex";

interface FormState {
  name: string;
  triggerType: AutoReplyTriggerType;
  triggerKeyword: string;
  replyText: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  triggerType: "contains",
  triggerKeyword: "",
  replyText: "",
  isActive: true,
};

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  contains:    "contains",
  is:          "is exactly",
  starts_with: "starts with",
  ends_with:   "ends with",
  regex:       "matches regex",
};

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function AutoRepliesSection(): JSX.Element {
  const { getToken } = useAuth();
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; editing: AutoReply | null }>({ open: false, editing: null });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/auto-replies`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setReplies((await res.json() as { data: AutoReply[] }).data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate(): void {
    setForm(EMPTY_FORM);
    setModal({ open: true, editing: null });
  }

  function openEdit(ar: AutoReply): void {
    setForm({
      name: ar.name,
      triggerType: ar.triggerType as AutoReplyTriggerType,
      triggerKeyword: ar.triggerKeyword,
      replyText: ar.replyText,
      isActive: ar.isActive,
    });
    setModal({ open: true, editing: ar });
  }

  async function handleSave(): Promise<void> {
    if (!form.name.trim() || !form.triggerKeyword.trim() || !form.replyText.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const url = modal.editing
        ? `${API_URL}/v1/auto-replies/${modal.editing.id}`
        : `${API_URL}/v1/auto-replies`;
      const method = modal.editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) { setModal({ open: false, editing: null }); await load(); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string): Promise<void> {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusy(id);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/auto-replies/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate(id: string): Promise<void> {
    setBusy(id);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/auto-replies/${id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Auto-Replies</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
        >
          + New Auto-Reply
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
        {loading && <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>}
        {!loading && replies.length === 0 && (
          <div className="flex flex-col items-center py-12 gap-2">
            <span className="text-4xl">💬</span>
            <p className="text-sm text-gray-400">No auto-replies yet.</p>
          </div>
        )}
        {replies.map((ar) => (
          <div key={ar.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-900">{ar.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Keyword {TRIGGER_TYPE_LABELS[ar.triggerType] ?? ar.triggerType}{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{ar.triggerKeyword}</code>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ar.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {ar.isActive ? "Active" : "Inactive"}
              </span>
              <button
                onClick={() => openEdit(ar)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded"
              >
                Edit
              </button>
              <button
                onClick={() => void handleDuplicate(ar.id)}
                disabled={busy === ar.id}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded disabled:opacity-50"
              >
                {busy === ar.id ? "…" : "Duplicate"}
              </button>
              <button
                onClick={() => void handleDelete(ar.id, ar.name)}
                disabled={busy === ar.id}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-100 rounded disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                {modal.editing ? "Edit Auto-Reply" : "New Auto-Reply"}
              </h3>
              <button onClick={() => setModal({ open: false, editing: null })} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Price Enquiry"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Match Type</label>
                  <select
                    value={form.triggerType}
                    onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as AutoReplyTriggerType }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    {Object.entries(TRIGGER_TYPE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>Message {label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Keyword</label>
                  <input
                    type="text"
                    value={form.triggerKeyword}
                    onChange={(e) => setForm((f) => ({ ...f, triggerKeyword: e.target.value }))}
                    placeholder="e.g. price"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Reply Message</label>
                <textarea
                  rows={4}
                  value={form.replyText}
                  onChange={(e) => setForm((f) => ({ ...f, replyText: e.target.value }))}
                  placeholder="Hello {{first_name}}, our price is…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ar-active"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="ar-active" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setModal({ open: false, editing: null })}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={!form.name.trim() || !form.triggerKeyword.trim() || !form.replyText.trim() || saving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : modal.editing ? "Save Changes" : "Create Auto-Reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/app/(dashboard)/flows/auto-replies-section.tsx"
git commit -m "feat(web): full CRUD for auto-replies — create, edit, delete modals"
```

---

## Task 17: Type-check + Final Verification

- [ ] **Step 1: Run type-check across all packages**

```bash
pnpm type-check 2>&1 | head -60
```

Fix any type errors. Common ones to watch for:
- `ReactFlowInstance` import — must be `import type { ..., ReactFlowInstance } from "reactflow"`
- `Node` / `Edge` imports — same
- `dagre` type: if `dagre.graphlib.Graph` errors, add `// @ts-expect-error dagre types` or check `@types/dagre` is installed

- [ ] **Step 2: Confirm dagre types are installed**

```bash
ls node_modules/@types/dagre 2>/dev/null && echo "types exist" || echo "missing"
```

If missing: `pnpm --filter @WBMSG/web add -D @types/dagre`

- [ ] **Step 3: Run API tests**

```bash
pnpm --filter @WBMSG/api test 2>&1 | grep -E "PASS|FAIL|Error" | head -20
```

All flows tests must pass.

- [ ] **Step 4: Delete orphaned `FlowCanvas.tsx`**

`FlowCanvas.tsx` is now replaced by `FlowEditor.tsx`. Delete it:

```bash
rm apps/web/components/flows/FlowCanvas.tsx
```

Confirm it's not imported anywhere:
```bash
grep -r "FlowCanvas" apps/web/components apps/web/app 2>/dev/null
```

Expected: no results.

- [ ] **Step 5: Run lint**

```bash
pnpm lint 2>&1 | grep -E "error|warning" | head -20
```

Fix any lint errors (unused imports, missing return types).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: remove orphaned FlowCanvas; fix type-check and lint after flows canvas overhaul"
```
