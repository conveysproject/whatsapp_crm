# Flows — Visual Canvas Overhaul Design

**Date:** 2026-05-30
**Author:** WATI Senior Developer perspective
**Status:** Approved

---

## Goal

Replace the existing stub flow UI (read-only ReactFlow canvas, no editor, no CRUD) with a production-grade visual canvas editor that matches WATI/Respond.io quality. Full scope: three-panel canvas builder, condition branching, polished list page, full auto-replies CRUD, flow run logs, and flow duplication.

---

## Architecture Overview

### Page Structure

| Route | Purpose |
|---|---|
| `flows/page.tsx` | List page — polished: search, stats, delete, duplicate |
| `flows/new/page.tsx` | Create flow (name + trigger picker → redirect to editor) — keep as-is, minimal changes |
| `flows/[id]/page.tsx` | **Full-screen three-panel canvas editor** (replaces current stub) |

The editor page breaks out of the dashboard layout padding — it uses the full viewport height. No separate `/edit` route; the detail page IS the editor (consistent with how WATI works: you land on the flow and immediately see the canvas).

### Component File Map

```
apps/web/components/flows/
  FlowEditor.tsx           ← 3-panel layout orchestrator + all editor state
  FlowNodePalette.tsx      ← left 240px palette sidebar
  FlowConfigPanel.tsx      ← right 320px config panel (all node type forms)
  utils/
    layout.ts              ← dagre auto-layout (TB direction)
    serialize.ts           ← FlowDefinition ↔ ReactFlow nodes/edges
  nodes/
    TriggerNode.tsx        ← redesigned trigger node
    ActionNode.tsx         ← all action types via color map
    ConditionNode.tsx      ← branch node with two source handles (Yes/No)
```

### Library

Stay on **ReactFlow v11.11.4** (already installed). No upgrade to @xyflow/react — no migration risk. Visual quality comes from node design and layout, not library version. Add **dagre** (installed: `@dagrejs/dagre`) for auto-layout.

---

## Canvas Layout

### Full-screen Three-Panel

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Flows  |  [Flow Name ✎]  ● Unsaved   [Test] [Save] [Active ◉]│  56px top bar
├──────────┬───────────────────────────────────────┬──────────────┤
│          │                                       │              │
│ PALETTE  │              CANVAS                   │   CONFIG     │
│ 240px    │           (flex-1)                    │   320px      │
│ fixed    │  white + dot-grid background          │  slide-in    │
│          │  brand-green bezier edges             │  on select   │
│          │  zoom controls bottom-left            │              │
└──────────┴───────────────────────────────────────┴──────────────┘
```

- **Tab strip** in top bar: `Builder` | `Logs` — switches between canvas and run history table
- Config panel slides in (translate-x animation) when a node is selected; collapses when canvas background is clicked or `Escape` is pressed
- `onBeforeUnload` warning fires when `isDirty = true`

---

## Node Designs

### Trigger Node

- **Size:** 280px wide
- **Header:** Brand-green bg (#16a34a), white text, ⚡ icon, "TRIGGER" label
- **Body:** White — shows prettified trigger type + keyword if applicable
- **Handles:** Source only (bottom center) — no target handle (it is always first)
- **Cannot be deleted**
- **Style:** `rounded-xl shadow-card border border-brand-200`

### Action Node

- **Size:** 280px wide
- **Header:** White with 4px colored left-border accent (see color map below)
- **Body:** Icon + node type label (bold) + content preview (2-line truncated, `text-gray-500`)
- **Handles:** Target (top center) + Source (bottom center)
- **Selection:** Brand-green ring (`ring-2 ring-brand-500`)
- **Style:** `rounded-xl shadow-card bg-white border border-gray-200`

**Left-border accent color map:**

| Node Type | Color | Hex |
|---|---|---|
| send_text | Blue | #3B82F6 |
| send_image | Cyan | #06B6D4 |
| send_video | Cyan | #06B6D4 |
| send_document | Slate | #64748B |
| send_buttons | Indigo | #6366F1 |
| send_list | Violet | #8B5CF6 |
| ask_question | Teal | #14B8A6 |
| wait | Amber | #F59E0B |
| add_label | Green | #22C55E |
| update_stage | Purple | #A855F7 |
| assign_agent | Orange | #F97316 |
| close_conversation | Red | #EF4444 |
| end | Gray | #6B7280 |

### Condition Node

- **Size:** 280px wide
- **Header:** Indigo left-border, 🔀 icon, "CONDITION"
- **Body:** Shows condition type + value
- **Handles:** Target (top center) + two Source handles: `Yes` (bottom-left) + `No` (bottom-right)
- Both output handles are labeled with "Yes" and "No" badges

---

## Left Palette (240px)

Two sections: **Triggers** (read-only, shows current trigger type) and **Actions** (clickable/draggable).

**Interaction:**
- **Click** → appends new node after the last node in the flow, auto-connected with a new edge
- **Drag** → drops at cursor position, auto-connects to nearest unconnected source handle

**Action items in palette:**
💬 Send Text · 🖼 Send Image · 🎬 Send Video · 📎 Send Document · 🔘 Send Buttons · 📋 Send List · ❓ Ask Question · 🔀 Condition · ⏱ Wait · 🏷 Add Label · 📈 Update Stage · 👤 Assign Agent · ✅ Close Conversation · 🔚 End Flow

---

## Right Config Panel (320px)

Slides in from the right (CSS `transform: translateX`) when a node is selected.

**Header row:** Node icon + type label + `[✕]` close button + `[🗑 Delete]` trash button (disabled for trigger node).

**Config forms per node type:**

| Node | Fields |
|---|---|
| Trigger | Read-only: trigger type + keyword (set at creation) |
| send_text | Textarea (message text) + variable chip row (`{{first_name}}` `{{last_name}}` `{{phone}}`) |
| send_image | URL/Media ID input + Caption input |
| send_video | URL/Media ID input + Caption input |
| send_document | URL/Media ID input + Filename input |
| send_buttons | Body textarea + up to 3 button rows (each: display text + button ID) |
| send_list | Header input + up to 10 list item rows (each: title + description) |
| ask_question | Question textarea + "Save reply to variable" input |
| wait | Duration number input + Unit select (minutes / hours / days) |
| add_label | Tag name input |
| update_stage | Stage select (lead / prospect / customer / loyal / churned) |
| assign_agent | Agent name or ID input |
| close_conversation | No config — info text "This closes the active conversation" |
| end | No config — info text "Flow execution ends here" |
| condition | Condition type select (contains / is / starts with / ends with) + Value input |

Config changes update node state immediately (no apply button) and mark `isDirty = true`.

---

## Canvas UX Details

- **Background:** White with 20px dot-grid (`#E5E7EB` dots, subtle)
- **Edges:** Bezier curves, `#16a34a` (brand-600), 2px stroke, animated dashes when `flow.isActive = true`
- **Controls:** Zoom in / zoom out / fit-view — bottom-left, minimal ReactFlow `<Controls />`
- **No minimap**
- **Auto-layout:** dagre `rankdir: TB`, nodeSep 40px, rankSep 80px — applied on initial load and after any node add/delete
- **Delete node:** `Delete` / `Backspace` key on selected node (trigger node is immune); also trash button in config panel; removes node + heals edges (reconnects predecessor to successor if both exist)

**Top bar:**
- `← Flows` breadcrumb link
- Flow name — click to edit inline (`contentEditable` div, `onBlur` commits + marks dirty)
- `● Unsaved changes` amber indicator (only when `isDirty`)
- `[Test]` button → opens modal: phone number input → enqueues test run via `POST /flows/:id/test`
- `[Save]` button → PATCH flow with new `flowDefinition` + name; disabled when clean
- Active pill toggle → PATCH `{ isActive }` independently (no save required)

**Keyboard shortcuts:**
- `Ctrl+S` / `Cmd+S` → save
- `Escape` → deselect / close config panel
- `Delete` / `Backspace` → delete selected node

---

## Editor State

All state lives in `FlowEditor.tsx` (React component state — no Zustand/external store needed):

```ts
nodes            Node[]           // ReactFlow nodes
edges            Edge[]           // ReactFlow edges
selectedNodeId   string | null    // drives config panel
isDirty          boolean          // unsaved changes indicator
saving           boolean          // save in-flight
flowName         string           // inline-editable
isActive         boolean          // active toggle
isToggling       boolean          // toggle in-flight
activeTab        'builder'|'logs' // tab strip
```

---

## Serialization (`utils/serialize.ts`)

**`deserializeFlow(flow) → { nodes, edges }`**
- Reads `flow.flowDefinition.nodes` array
- Maps each `FlowNode` to a ReactFlow `Node` with `type` = `trigger` | `action` | `condition`
- Creates edges from `node.next` (and `node.nextNo` for condition nodes)
- Applies dagre layout to compute `position.x/y`

**`serializeFlow(nodes, edges) → FlowDefinition`**
- Rebuilds `FlowDefinition.nodes` array from ReactFlow state
- For each node: derives `next` from outgoing edge (or `nextYes`/`nextNo` for condition nodes — edge `sourceHandle` = `"yes"` or `"no"`)
- `startNodeId` = the trigger node's id

**Note:** `FlowNode` interface in `flow-runner.ts` must be extended to add `nextNo?: string | null` for condition nodes. The runner must handle `condition` node type: evaluate `config.conditionType` + `config.value` against `payload.messageBody`, then follow `next` (yes) or `nextNo` (no).

---

## Auto-layout (`utils/layout.ts`)

```ts
import dagre from 'dagre';

export function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => g.setNode(n.id, { width: 280, height: 90 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map(n => {
    const { x, y } = g.node(n.id);
    return { ...n, position: { x: x - 140, y: y - 45 } };
  });
}
```

---

## API Changes

### New Endpoints

**`POST /v1/flows/:id/duplicate`**
- Clones flow: `name = "Copy of {original.name}"`, `isActive = false`, same `triggerType` + `flowDefinition`
- Returns 201 with new flow

**`GET /v1/flows/:id/runs`**
- Returns paginated `FlowRun[]` newest-first
- Query params: `limit` (default 50), `cursor`

### Updated Endpoints

**`GET /v1/flows`**
- Include `_count: { runs: true }` so list page can show run count per flow

### Existing (unchanged)
- `POST /v1/flows/:id/test` — already exists, wire up test modal

---

## Database — New Model

```prisma
model FlowRun {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  flowId         String    @map("flow_id")
  flow           Flow      @relation(fields: [flowId], references: [id], onDelete: Cascade)
  contactPhone   String?   @map("contact_phone")
  conversationId String?   @map("conversation_id")
  status         String    @default("completed") // running | completed | failed
  stepsExecuted  Int       @default(0)           @map("steps_executed")
  error          String?
  startedAt      DateTime  @default(now())       @map("started_at")
  completedAt    DateTime?                        @map("completed_at")

  @@index([organizationId, flowId])
  @@map("flow_runs")
}
```

`Flow` model gets: `runs FlowRun[]`

Flow runner (`flow-runner.ts`) creates a `FlowRun` record at start (status: `running`), increments `stepsExecuted` per node, and updates to `completed` or `failed` at end.

---

## List Page Polish (`flows/page.tsx`)

- Search bar (client-side filter on `flow.name`)
- Per-flow row: name + trigger type badge + active badge + run count chip + last-run relative time
- Row actions: **Activate/Deactivate** toggle · **Duplicate** · **Delete** (with confirm)
- Empty state: illustration + "Create your first flow" CTA
- Auto-replies section below — full CRUD (create modal, edit modal, delete confirm, duplicate button)

---

## Auto-Replies CRUD (`auto-replies-section.tsx`)

Add:
- **New Auto-Reply** button → slide-in modal with full form (name, trigger type, keyword, reply text, flow link)
- **Edit** button per row → same modal pre-filled
- **Delete** button per row → inline confirm (`window.confirm`)
- Keep existing **Duplicate** button

---

## Implementation Order

1. Schema push + Prisma generate (FlowRun model — already done in schema)
2. API: duplicate endpoint + runs endpoint + `_count` on list
3. Flow runner: write FlowRun records
4. `utils/layout.ts` + `utils/serialize.ts`
5. `nodes/TriggerNode.tsx` (redesign)
6. `nodes/ActionNode.tsx` (redesign)
7. `nodes/ConditionNode.tsx` (new)
8. `FlowNodePalette.tsx`
9. `FlowConfigPanel.tsx`
10. `FlowEditor.tsx` (orchestrates everything)
11. `flows/[id]/page.tsx` (replace with FlowEditor)
12. `flows/page.tsx` (list page polish)
13. `auto-replies-section.tsx` (full CRUD)
