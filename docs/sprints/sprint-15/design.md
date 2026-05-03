# Sprint 15 — Flow Builder

## Sprint Goal
Let non-technical team leads automate multi-step conversation workflows on a visual canvas — trigger → action chains that run without agent involvement.

## What We're Building

- **Flow runner** — `apps/api/src/lib/flow-runner.ts`: `runFlow(prisma, flowDefinition, payload)` executes a node graph. Node types: `send_message` (sends WhatsApp template or freetext), `update_stage` (sets lifecycle stage on contact), `assign_conversation` (sets `assignedTo`), `add_tag` (appends tag to contact), `wait` (BullMQ delayed job resumes execution after N seconds), `end` (terminates). Execution follows `node.next` until `null` or `end`.
- **Flow CRUD API** — `apps/api/src/routes/flows.ts`: `GET/POST/PATCH/DELETE /v1/flows`. A `Flow` has `name`, `trigger` (JSONB: `{ type: "inbound_message" | "contact_created" | "tag_added", config: {} }`), and `definition` (JSONB: `FlowDefinition`). `POST /v1/flows/:id/test` — dry-run with a mock payload, returns execution trace (node IDs visited, actions taken).
- **FlowCanvas** — `apps/web/components/flows/FlowCanvas.tsx`: `reactflow` canvas with a sidebar of draggable node types. Nodes: `TriggerNode` (blue, one per flow), `ActionNode` (gray, multiple). Edges connect nodes. Canvas state serializes to `FlowDefinition` JSON on save.
- **TriggerNode + ActionNode** — `apps/web/components/flows/nodes/TriggerNode.tsx` and `ActionNode.tsx`: custom React Flow node components. Each node has a config panel (right sidebar drawer) that opens on click — sets node-specific fields (message body, stage name, tag, wait duration).
- **Flows list page** — `apps/web/app/(dashboard)/flows/page.tsx`: table of flows with name, trigger type, active/inactive toggle, and Edit button. `apps/web/app/(dashboard)/flows/[id]/page.tsx`: full-screen canvas editor.

## Key Technical Decisions

- **Application-layer graph execution, not a DSL interpreter** — Each node type is a `switch` branch in `runFlow`. Simple, debuggable, no external dependency. A proper workflow engine (Temporal, Inngest) is Sprint 22+ if flow complexity demands it.
- **`wait` node uses BullMQ delayed jobs** — The runner enqueues a `resume-flow` job with `{ flowId, nodeId, conversationId }` and a delay equal to the configured wait duration. The worker picks it up and calls `runFlow` from the next node. No cron, no polling.
- **`FlowDefinition` stored as JSONB** — Flows evolve rapidly in Sprint 15. A normalized `flow_nodes` table would require migrations on every node type addition. JSONB allows schema evolution without migrations; validation is in the TypeScript types.
- **`reactflow` for canvas** — Industry-standard React flow diagram library. Built-in node drag, edge drawing, minimap, zoom/pan. Custom node types (TriggerNode, ActionNode) are plain React components passed to `nodeTypes` prop.
- **Trigger evaluation in the inbound message worker** — After routing, the worker checks if any active flow has `trigger.type === "inbound_message"` matching the conversation's conditions. If yes, it enqueues a `run-flow` BullMQ job. Flows do not block the worker.

## Dependencies

- **External:** `reactflow` npm package installed in web app
- **Internal:** Sprints 1–14 complete; BullMQ worker infrastructure exists; WhatsApp send route exists

## Definition of Done

- [ ] `POST /v1/flows` creates a flow with trigger + definition; `GET /v1/flows` returns it
- [ ] `POST /v1/flows/:id/test` returns execution trace (list of node IDs visited)
- [ ] Inbound message matching a flow trigger → flow executes; `send_message` node sends WhatsApp message
- [ ] `/flows` page lists flows; `/flows/[id]` opens canvas editor
- [ ] Dragging a node type onto canvas adds a node; connecting nodes draws an edge; Save serializes to DB
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `flows.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Infinite loop in flow graph (cycle) | Medium | High | Runner tracks visited node IDs; errors if same node visited twice |
| `reactflow` SSR issues with Next.js App Router | Medium | High | `FlowCanvas` is `"use client"`; dynamic import with `ssr: false` |
| Flow definition JSON schema drift between versions | Medium | Medium | TypeScript `FlowDefinition` interface is the schema; old flows validated on load — unknown node types are skipped |
| Large flow (50+ nodes) performance | Low | Low | reactflow virtualizes off-screen nodes; no action needed in Sprint 15 |
