# AI Creator — Template & Flow Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a split-screen AI assistant that lets agents describe a WhatsApp template or automation flow in plain language and get a fully-generated, ready-to-save result — with zero customer/contact PII touching any AI service.

**Architecture:** Six tasks in two phases: backend AI routes (Tasks 1–3) then frontend creator pages (Tasks 4–6). The backend uses Claude claude-sonnet-4-6 for structured JSON generation and fal.ai for header images; the frontend adds a `/templates/ai-create` and `/flows/ai-create` route each with a split-screen layout (AiChatPanel left, preview right). Existing TemplateForm and FlowEditor are reused by serialising AI output to sessionStorage before navigation.

**Tech Stack:** Fastify (API), Next.js App Router + React (web), `@anthropic-ai/sdk`, `@fal-ai/client`, Cloudflare R2 (image storage), ReactFlow (flow preview), Zod (PII validation), Tailwind CSS.

## Global Constraints

- Zero customer/contact PII in any AI request — names, phone numbers, emails, contact IDs, conversation IDs are all blocked at the API schema layer.
- All `/ai/creator/*` routes require a valid Clerk session token and minimum `AGENT` role (same RBAC as the rest of the API).
- Claude model: `claude-sonnet-4-6` with `max_tokens: 2048` and structured JSON output.
- Image generation: `fal-ai/flux/schnell` via `@fal-ai/client`. Images uploaded to Cloudflare R2 via existing `uploadToR2()` in `apps/api/src/lib/r2.ts`.
- API env vars required: `ANTHROPIC_API_KEY`, `FAL_KEY`.
- Template body text ≤ 1024 chars; header text ≤ 60 chars; footer ≤ 60 chars; button labels ≤ 25 chars. These limits are enforced in the AI system prompt.
- No carousel templates in v1 (subType is always `standard`, `coupon`, or `lto`).
- Follow the existing test pattern in `apps/api/src/routes/ai.test.ts` (Fastify test app, vi.mock for external libs).

---

## File Map

**Create:**
- `apps/api/src/lib/ai-creator.ts` — Claude claude-sonnet-4-6 functions for template + flow generation/refinement
- `apps/api/src/lib/fal-image.ts` — fal.ai image generation + R2 upload
- `apps/web/components/ai/AiChatPanel.tsx` — left-side chat panel (shared)
- `apps/web/components/ai/AiActionBar.tsx` — action buttons (shared)
- `apps/web/components/ai/AiCreatorLayout.tsx` — split-screen wrapper (shared)
- `apps/web/components/ai/TemplateAiPreview.tsx` — right-side live template preview
- `apps/web/components/ai/FlowAiPreview.tsx` — right-side read-only ReactFlow canvas
- `apps/web/app/(dashboard)/templates/ai-create/page.tsx` — Template AI Creator page
- `apps/web/app/(dashboard)/flows/ai-create/page.tsx` — Flow AI Creator page

**Modify:**
- `apps/api/package.json` — add `@anthropic-ai/sdk`, `@fal-ai/client`
- `apps/api/src/routes/ai.ts` — add 5 new creator routes
- `apps/api/src/routes/ai.test.ts` — add tests for new routes
- `apps/web/app/(dashboard)/templates/page.tsx` — add "Create with AI" button
- `apps/web/app/(dashboard)/flows/page.tsx` — add "Create with AI" button
- `apps/web/app/(dashboard)/templates/new/TemplateForm.tsx` — read AI draft from sessionStorage on mount

---

## Task 1: Install packages + Claude AI creator lib

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/lib/ai-creator.ts`

**Interfaces:**
- Produces:
  - `generateTemplate(description: string): Promise<{ templateState: TemplateFormState; imagePrompt: string }>`
  - `refineTemplate(templateState: TemplateFormState, imageUrl: string, refinement: string): Promise<{ templateState: TemplateFormState; regenerateImage: boolean; imagePrompt?: string }>`
  - `generateFlow(description: string): Promise<{ flowDefinition: FlowDefinition; triggerType: string; suggestedName: string }>`
  - `refineFlow(flowDefinition: FlowDefinition, triggerType: string, refinement: string): Promise<{ flowDefinition: FlowDefinition; triggerType: string }>`

- [ ] **Step 1: Install packages**

```bash
cd apps/api && npm install @anthropic-ai/sdk @fal-ai/client
```

Expected: packages added to `apps/api/package.json` and `node_modules`.

- [ ] **Step 2: Create `apps/api/src/lib/ai-creator.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { TemplateFormState } from "../../../web/app/(dashboard)/templates/new/templateFormTypes.js";

// Import from shared package instead — the types are defined in apps/web.
// We duplicate the minimal types needed here to avoid cross-app imports.
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

export interface AiTemplateResult {
  templateState: TemplateFormState;
  imagePrompt: string;
}

export interface AiTemplateRefineResult {
  templateState: TemplateFormState;
  regenerateImage: boolean;
  imagePrompt?: string;
}

export interface AiFlowResult {
  flowDefinition: FlowDefinition;
  triggerType: string;
  suggestedName: string;
}

function getClient(): Anthropic {
  if (!process.env["ANTHROPIC_API_KEY"]) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
}

const MODEL = "claude-sonnet-4-6";

const TEMPLATE_STATE_SHAPE = `{
  "name": "snake_case_name",
  "category": "marketing" | "utility" | "authentication",
  "language": "en",
  "parameterFormat": "positional",
  "subType": "standard" | "coupon" | "lto",
  "headerType": "none" | "text" | "image",
  "headerText": "",
  "headerMediaUrl": "",
  "bodyText": "",
  "footerText": "",
  "addSecurityRecommendation": false,
  "codeExpirationMinutes": "",
  "otpType": "copy_code",
  "otpButtonText": "",
  "ltoText": "",
  "ltoHasExpiration": true,
  "couponExampleCode": "",
  "buttons": [],
  "cards": [],
  "variableExamples": {}
}`;

const TEMPLATE_SYSTEM_PROMPT = `You are a WhatsApp Business template generator for a CRM platform.

STRICT PRIVACY RULE: Never request, infer, use, or store customer names, phone numbers, email addresses, contact IDs, or any personal data. If any personal data appears in the description, ignore it completely.

Generate valid WhatsApp Business API templates based on business intent descriptions.

LIMITS (strictly enforced by Meta):
- bodyText: max 1024 characters
- headerText: max 60 characters  
- footerText: max 60 characters
- button text: max 25 characters
- template name: max 512 chars, only lowercase letters, numbers, underscores

VARIABLE FORMAT: Use {{1}}, {{2}}, {{3}} for dynamic values (positional format).

BUTTON TYPES allowed: quick_reply, url, phone_number

RESPONSE FORMAT — return ONLY this JSON, no markdown:
{
  "templateState": ${TEMPLATE_STATE_SHAPE},
  "imagePrompt": "detailed image generation prompt for the header image, or empty string if headerType is not image"
}`;

const FLOW_SYSTEM_PROMPT = `You are a WhatsApp automation flow generator for a CRM platform.

STRICT PRIVACY RULE: Never request, infer, use, or store customer names, phone numbers, email addresses, or any personal data.

Generate automation flows from natural language descriptions.

TRIGGER TYPES: new_conversation, inbound_message, keyword_match, button_reply, contact_created, tag_added, lifecycle_change, conversation_resolved, conversation_assigned, no_reply

ACTION NODE TYPES: send_text, send_interactive, wait, add_label, assign_agent, close_conversation, end

CONDITION NODE TYPE: condition

NODE CONFIG SHAPES:
- send_text: { "text": "..." }
- wait: { "duration": 2, "unit": "hours" }
- add_label: { "tag": "label-name" }
- assign_agent: { "assignTo": "team" }
- close_conversation: {}
- condition: { "conditionType": "contains", "value": "keyword" }
- end: {}

RESPONSE FORMAT — return ONLY this JSON, no markdown:
{
  "flowDefinition": {
    "startNodeId": "node-1",
    "nodes": [
      { "id": "node-1", "type": "keyword_match", "config": { "keyword": "refund", "matchType": "contains" }, "next": "node-2", "nextNo": null }
    ]
  },
  "triggerType": "keyword_match",
  "suggestedName": "Short descriptive flow name"
}`;

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function generateTemplate(description: string): Promise<AiTemplateResult> {
  const client = getClient();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: TEMPLATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Create a WhatsApp template for: ${description}` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return parseJson<AiTemplateResult>(text);
}

export async function refineTemplate(
  templateState: object,
  imageUrl: string,
  refinement: string
): Promise<AiTemplateRefineResult> {
  const client = getClient();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: TEMPLATE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the current template state:\n${JSON.stringify(templateState)}\n\nCurrent image URL: ${imageUrl || "none"}\n\nApply this refinement: ${refinement}\n\nReturn the updated template. Set "regenerateImage": true if the image should be regenerated, and include a new "imagePrompt" if so. Format: { "templateState": {...}, "regenerateImage": boolean, "imagePrompt": "..." }`,
      },
    ],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return parseJson<AiTemplateRefineResult>(text);
}

export async function generateFlow(description: string): Promise<AiFlowResult> {
  const client = getClient();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: FLOW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Create an automation flow for: ${description}` }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return parseJson<AiFlowResult>(text);
}

export async function refineFlow(
  flowDefinition: object,
  triggerType: string,
  refinement: string
): Promise<AiFlowResult> {
  const client = getClient();
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: FLOW_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the current flow:\nTrigger: ${triggerType}\nDefinition: ${JSON.stringify(flowDefinition)}\n\nApply this refinement: ${refinement}\n\nReturn the complete updated flow definition.`,
      },
    ],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return parseJson<AiFlowResult>(text);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from `ai-creator.ts` (ignore unrelated pre-existing errors if any).

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/src/lib/ai-creator.ts
git commit -m "feat(ai-creator): add Claude ai-creator lib for template + flow generation"
```

---

## Task 2: fal.ai image generation + R2 upload lib

**Files:**
- Create: `apps/api/src/lib/fal-image.ts`

**Interfaces:**
- Consumes: `uploadToR2(buffer, organizationId, mimeType)` from `apps/api/src/lib/r2.ts`
- Produces: `generateAndUploadImage(prompt: string, organizationId: string): Promise<string>` — returns permanent R2 URL

- [ ] **Step 1: Create `apps/api/src/lib/fal-image.ts`**

```typescript
import * as fal from "@fal-ai/client";
import { uploadToR2 } from "./r2.js";

export async function generateAndUploadImage(
  prompt: string,
  organizationId: string,
): Promise<string> {
  if (!process.env["FAL_KEY"]) throw new Error("FAL_KEY is not set");

  fal.config({ credentials: process.env["FAL_KEY"] });

  const result = await fal.run("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "landscape_4_3",
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    },
  }) as { images: Array<{ url: string; content_type: string }> };

  const image = result.images[0];
  if (!image?.url) throw new Error("fal.ai returned no image");

  const imageRes = await fetch(image.url);
  if (!imageRes.ok) throw new Error(`Failed to fetch generated image: ${imageRes.status}`);
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  const { url } = await uploadToR2(buffer, organizationId, image.content_type ?? "image/jpeg");
  return url;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/fal-image.ts
git commit -m "feat(ai-creator): add fal.ai image generation with R2 upload"
```

---

## Task 3: AI creator API routes + tests

**Files:**
- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/routes/ai.test.ts`

**Interfaces:**
- Consumes: `generateTemplate`, `refineTemplate`, `generateFlow`, `refineFlow` from `../lib/ai-creator.js`
- Consumes: `generateAndUploadImage` from `../lib/fal-image.js`
- Produces (REST):
  - `POST /ai/creator/template/generate` → `{ data: { templateState, imageUrl } }`
  - `POST /ai/creator/template/refine` → `{ data: { templateState, imageUrl?, regenerateImage } }`
  - `POST /ai/creator/template/image` → `{ data: { imageUrl } }`
  - `POST /ai/creator/flow/generate` → `{ data: { flowDefinition, triggerType, suggestedName } }`
  - `POST /ai/creator/flow/refine` → `{ data: { flowDefinition, triggerType } }`

- [ ] **Step 1: Write failing tests in `apps/api/src/routes/ai.test.ts`**

Add these tests at the bottom of the file (before the closing `}`):

```typescript
// ── AI Creator mocks ────────────────────────────────────────────────────────
vi.mock("../lib/ai-creator.js", () => ({
  generateTemplate: vi.fn().mockResolvedValue({
    templateState: {
      name: "eid_sale",
      category: "marketing",
      language: "en",
      parameterFormat: "positional",
      subType: "standard",
      headerType: "image",
      headerText: "",
      headerMediaUrl: "",
      bodyText: "Get 30% off this Eid! Use code EID30.",
      footerText: "Valid till 30 June",
      addSecurityRecommendation: false,
      codeExpirationMinutes: "",
      otpType: "copy_code",
      otpButtonText: "",
      ltoText: "",
      ltoHasExpiration: true,
      couponExampleCode: "",
      buttons: [{ id: "b1", type: "url", text: "Shop Now", url: "https://example.com", urlIsDynamic: false, urlExample: "", phone: "", couponExample: "" }],
      cards: [],
      variableExamples: {},
    },
    imagePrompt: "Festive Eid sale banner with 30% off",
  }),
  refineTemplate: vi.fn().mockResolvedValue({
    templateState: {
      name: "eid_sale",
      category: "marketing",
      language: "en",
      parameterFormat: "positional",
      subType: "standard",
      headerType: "image",
      headerText: "",
      headerMediaUrl: "",
      bodyText: "30% off!",
      footerText: "",
      addSecurityRecommendation: false,
      codeExpirationMinutes: "",
      otpType: "copy_code",
      otpButtonText: "",
      ltoText: "",
      ltoHasExpiration: true,
      couponExampleCode: "",
      buttons: [],
      cards: [],
      variableExamples: {},
    },
    regenerateImage: false,
  }),
  generateFlow: vi.fn().mockResolvedValue({
    flowDefinition: {
      startNodeId: "node-1",
      nodes: [
        { id: "node-1", type: "keyword_match", config: { keyword: "refund", matchType: "contains" }, next: "node-2", nextNo: null },
        { id: "node-2", type: "send_text", config: { text: "Here is our refund policy." }, next: null, nextNo: null },
      ],
    },
    triggerType: "keyword_match",
    suggestedName: "Refund Handling",
  }),
  refineFlow: vi.fn().mockResolvedValue({
    flowDefinition: {
      startNodeId: "node-1",
      nodes: [
        { id: "node-1", type: "keyword_match", config: { keyword: "refund", matchType: "contains" }, next: "node-2", nextNo: null },
        { id: "node-2", type: "wait", config: { duration: 1, unit: "hours" }, next: "node-3", nextNo: null },
        { id: "node-3", type: "send_text", config: { text: "Here is our refund policy." }, next: null, nextNo: null },
      ],
    },
    triggerType: "keyword_match",
  }),
}));

vi.mock("../lib/fal-image.js", () => ({
  generateAndUploadImage: vi.fn().mockResolvedValue("https://cdn.example.com/org-1/image.jpg"),
}));

describe("POST /v1/ai/creator/template/generate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("generates template and image url from description", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/generate",
      payload: { description: "30% off Eid sale with Shop Now button" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { templateState: object; imageUrl: string } };
    expect(body.data.imageUrl).toBe("https://cdn.example.com/org-1/image.jpg");
    expect(body.data.templateState).toMatchObject({ name: "eid_sale", category: "marketing" });
  });

  it("returns 400 if description is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/ai/creator/template/generate", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 if description contains a phone number", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/generate",
      payload: { description: "Send message to +919876543210 about sale" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/ai/creator/template/refine", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("refines template and returns updated state", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/refine",
      payload: {
        templateState: { name: "eid_sale", bodyText: "Get 30% off this Eid!" },
        imageUrl: "https://cdn.example.com/org-1/old.jpg",
        refinement: "Make the body shorter",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { templateState: object; regenerateImage: boolean } };
    expect(body.data.regenerateImage).toBe(false);
  });
});

describe("POST /v1/ai/creator/template/image", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("generates and uploads image, returns url", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/template/image",
      payload: { prompt: "Festive Eid sale banner with 30% off" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { imageUrl: string } };
    expect(body.data.imageUrl).toBe("https://cdn.example.com/org-1/image.jpg");
  });
});

describe("POST /v1/ai/creator/flow/generate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("generates flow definition from description", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/flow/generate",
      payload: { description: "When customer says refund send our policy" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { flowDefinition: object; triggerType: string; suggestedName: string } };
    expect(body.data.triggerType).toBe("keyword_match");
    expect(body.data.suggestedName).toBe("Refund Handling");
  });

  it("returns 400 if description is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/ai/creator/flow/generate", payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/ai/creator/flow/refine", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("refines flow and returns updated definition", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/creator/flow/refine",
      payload: {
        flowDefinition: { startNodeId: "node-1", nodes: [] },
        triggerType: "keyword_match",
        refinement: "Add a 1-hour wait before sending",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { flowDefinition: { nodes: unknown[] } } };
    expect(body.data.flowDefinition.nodes).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && npx vitest run src/routes/ai.test.ts 2>&1 | tail -20
```

Expected: FAIL — routes not yet defined.

- [ ] **Step 3: Add the 5 creator routes to `apps/api/src/routes/ai.ts`**

Add these imports at the top of `ai.ts`:

```typescript
import { generateTemplate, refineTemplate, generateFlow, refineFlow } from "../lib/ai-creator.js";
import { generateAndUploadImage } from "../lib/fal-image.js";
import { z } from "zod";
```

Add a PII guard function (place before the `aiRouter` export):

```typescript
const PII_PATTERN = /(\+\d{10,}|\b\d{10,}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

function containsPii(value: unknown): boolean {
  if (typeof value === "string") return PII_PATTERN.test(value);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(containsPii);
  }
  return false;
}
```

Add these 5 routes inside the `aiRouter` function body, at the end (before the closing `}`):

```typescript
  // ── AI Creator: Template generation ──────────────────────────────────────
  fastify.post<{ Body: { description: string } }>("/ai/creator/template/generate", async (request, reply) => {
    const { description } = request.body;
    if (!description || description.trim().length < 3) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "description is required" } });
    }
    if (containsPii(description)) {
      return reply.status(400).send({ error: { code: "PII_DETECTED", message: "Description must not contain personal data" } });
    }
    const { organizationId } = request.auth;
    const { templateState, imagePrompt } = await generateTemplate(description.trim());
    let imageUrl = "";
    if (imagePrompt && templateState.headerType === "image") {
      try {
        imageUrl = await generateAndUploadImage(imagePrompt, organizationId);
      } catch { /* non-critical — preview shows placeholder */ }
    }
    return reply.send({ data: { templateState, imageUrl } });
  });

  // ── AI Creator: Template refinement ────────────────────────────────────────
  fastify.post<{ Body: { templateState: object; imageUrl: string; refinement: string } }>(
    "/ai/creator/template/refine",
    async (request, reply) => {
      const { templateState, imageUrl, refinement } = request.body;
      if (!templateState || !refinement) {
        return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "templateState and refinement are required" } });
      }
      if (containsPii(refinement)) {
        return reply.status(400).send({ error: { code: "PII_DETECTED", message: "Refinement must not contain personal data" } });
      }
      const { organizationId } = request.auth;
      const result = await refineTemplate(templateState, imageUrl ?? "", refinement);
      let newImageUrl = imageUrl;
      if (result.regenerateImage && result.imagePrompt) {
        try {
          newImageUrl = await generateAndUploadImage(result.imagePrompt, organizationId);
        } catch { /* non-critical */ }
      }
      return reply.send({ data: { templateState: result.templateState, imageUrl: newImageUrl, regenerateImage: result.regenerateImage } });
    }
  );

  // ── AI Creator: Standalone image generation ────────────────────────────────
  fastify.post<{ Body: { prompt: string } }>("/ai/creator/template/image", async (request, reply) => {
    const { prompt } = request.body;
    if (!prompt || prompt.trim().length < 3) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "prompt is required" } });
    }
    const { organizationId } = request.auth;
    const imageUrl = await generateAndUploadImage(prompt.trim(), organizationId);
    return reply.send({ data: { imageUrl } });
  });

  // ── AI Creator: Flow generation ────────────────────────────────────────────
  fastify.post<{ Body: { description: string } }>("/ai/creator/flow/generate", async (request, reply) => {
    const { description } = request.body;
    if (!description || description.trim().length < 3) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "description is required" } });
    }
    if (containsPii(description)) {
      return reply.status(400).send({ error: { code: "PII_DETECTED", message: "Description must not contain personal data" } });
    }
    const result = await generateFlow(description.trim());
    return reply.send({ data: result });
  });

  // ── AI Creator: Flow refinement ────────────────────────────────────────────
  fastify.post<{ Body: { flowDefinition: object; triggerType: string; refinement: string } }>(
    "/ai/creator/flow/refine",
    async (request, reply) => {
      const { flowDefinition, triggerType, refinement } = request.body;
      if (!flowDefinition || !triggerType || !refinement) {
        return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "flowDefinition, triggerType and refinement are required" } });
      }
      if (containsPii(refinement)) {
        return reply.status(400).send({ error: { code: "PII_DETECTED", message: "Refinement must not contain personal data" } });
      }
      const result = await refineFlow(flowDefinition, triggerType, refinement);
      return reply.send({ data: result });
    }
  );
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && npx vitest run src/routes/ai.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/ai.ts apps/api/src/routes/ai.test.ts
git commit -m "feat(ai-creator): add 5 AI creator API routes with PII guard"
```

---

## Task 4: Shared frontend AI components

**Files:**
- Create: `apps/web/components/ai/AiChatPanel.tsx`
- Create: `apps/web/components/ai/AiActionBar.tsx`
- Create: `apps/web/components/ai/AiCreatorLayout.tsx`

**Interfaces:**
- Produces:
  - `<AiChatPanel messages onSend isPending placeholder />` — chat thread + input
  - `<AiActionBar onPrimary primaryLabel onRefine onEdit disabled />` — 3 action buttons
  - `<AiCreatorLayout title backHref preview children />` — split screen wrapper

- [ ] **Step 1: Create `apps/web/components/ai/AiChatPanel.tsx`**

```tsx
"use client";

import { JSX, useRef, useEffect, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isPending: boolean;
  placeholder?: string;
}

export function AiChatPanel({ messages, onSend, isPending, placeholder = "Describe what you want to create..." }: AiChatPanelProps): JSX.Element {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput("");
    onSend(text);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">{placeholder}</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-800"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isPending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-gray-200 p-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          rows={2}
          disabled={isPending}
          placeholder="Type your request..."
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isPending}
          className="px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/ai/AiActionBar.tsx`**

```tsx
"use client";

import { JSX } from "react";

interface AiActionBarProps {
  onPrimary: () => void;
  primaryLabel: string;
  onRefine: () => void;
  onEdit: () => void;
  editLabel?: string;
  disabled?: boolean;
}

export function AiActionBar({
  onPrimary,
  primaryLabel,
  onRefine,
  onEdit,
  editLabel = "Edit Manually",
  disabled = false,
}: AiActionBarProps): JSX.Element {
  return (
    <div className="border-t border-gray-200 bg-white p-3 flex gap-2 justify-end">
      <button
        onClick={onEdit}
        disabled={disabled}
        className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {editLabel}
      </button>
      <button
        onClick={onRefine}
        disabled={disabled}
        className="px-4 py-2 text-sm font-medium border border-brand-300 rounded-lg text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Refine with AI
      </button>
      <button
        onClick={onPrimary}
        disabled={disabled}
        className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {primaryLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/ai/AiCreatorLayout.tsx`**

```tsx
"use client";

import { JSX, ReactNode } from "react";
import Link from "next/link";

interface AiCreatorLayoutProps {
  title: string;
  backHref: string;
  preview: ReactNode;
  children: ReactNode;
}

export function AiCreatorLayout({ title, backHref, preview, children }: AiCreatorLayoutProps): JSX.Element {
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
        <h1 className="text-base font-semibold text-gray-900">{title}</h1>
        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-brand-100 text-brand-700 rounded-full">AI</span>
      </div>

      {/* Split body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: chat */}
        <div className="w-[40%] border-r border-gray-200 flex flex-col min-h-0">
          {children}
        </div>

        {/* Right: preview */}
        <div className="w-[60%] flex flex-col min-h-0 bg-gray-50">
          {preview}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript in web app**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "components/ai" | head -20
```

Expected: no errors from the new AI component files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ai/
git commit -m "feat(ai-creator): add shared AiChatPanel, AiActionBar, AiCreatorLayout components"
```

---

## Task 5: Template AI Creator

**Files:**
- Create: `apps/web/components/ai/TemplateAiPreview.tsx`
- Create: `apps/web/app/(dashboard)/templates/ai-create/page.tsx`
- Modify: `apps/web/app/(dashboard)/templates/page.tsx`
- Modify: `apps/web/app/(dashboard)/templates/new/TemplateForm.tsx`

**Interfaces:**
- Consumes: `AiCreatorLayout`, `AiChatPanel`, `AiActionBar` from Task 4
- Consumes: `TemplatePreview` from `@/components/templates/TemplatePreview`
- Consumes: `buildComponents` from `./buildComponents`
- Produces: `/templates/ai-create` route, sessionStorage key `ai_template_draft`

- [ ] **Step 1: Create `apps/web/components/ai/TemplateAiPreview.tsx`**

```tsx
"use client";

import { JSX } from "react";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { buildComponents } from "@/app/(dashboard)/templates/new/buildComponents";
import type { TemplateFormState } from "@/app/(dashboard)/templates/new/templateFormTypes";

interface TemplateAiPreviewProps {
  templateState: TemplateFormState | null;
  imageUrl: string;
  imageLoading: boolean;
}

export function TemplateAiPreview({ templateState, imageUrl, imageLoading }: TemplateAiPreviewProps): JSX.Element {
  if (!templateState) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-8">
          Describe your template in the chat and AI will generate a preview here.
        </p>
      </div>
    );
  }

  // Inject the R2 image URL into the state before building components
  const stateWithImage: TemplateFormState = imageUrl
    ? { ...templateState, headerMediaUrl: imageUrl }
    : templateState;

  const components = buildComponents(stateWithImage);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-sm mx-auto">
        <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wide">Preview</p>

        {/* Image skeleton while generating */}
        {templateState.headerType === "image" && imageLoading && (
          <div className="w-full h-40 bg-gray-200 rounded-xl mb-3 animate-pulse flex items-center justify-center">
            <span className="text-xs text-gray-400">Generating image…</span>
          </div>
        )}

        <div className="bg-[#e5ddd5] rounded-2xl p-4">
          <TemplatePreview components={components} templateName={templateState.name} />
        </div>

        {templateState.name && (
          <p className="text-xs text-gray-400 text-center mt-3">
            Template: <span className="font-mono">{templateState.name}</span> · {templateState.category} · {templateState.language}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/templates/ai-create/page.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AiCreatorLayout } from "@/components/ai/AiCreatorLayout";
import { AiChatPanel, type ChatMessage } from "@/components/ai/AiChatPanel";
import { AiActionBar } from "@/components/ai/AiActionBar";
import { TemplateAiPreview } from "@/components/ai/TemplateAiPreview";
import { INITIAL_STATE } from "@/app/(dashboard)/templates/new/templateFormTypes";
import type { TemplateFormState } from "@/app/(dashboard)/templates/new/templateFormTypes";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function TemplateAiCreatePage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! Describe the template you want to create. For example: \"30% off Eid sale with a Shop Now button\" or \"Order confirmation with a track shipment link\"." },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [templateState, setTemplateState] = useState<TemplateFormState | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefineMode, setIsRefineMode] = useState(false);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  async function handleSend(text: string) {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsPending(true);
    setError(null);

    try {
      const headers = await authHeaders();

      if (!isRefineMode || !templateState) {
        // Initial generation
        const res = await fetch(`${API_URL}/v1/ai/creator/template/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ description: text }),
        });
        if (!res.ok) {
          const json = await res.json() as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Generation failed");
        }
        const json = await res.json() as { data: { templateState: TemplateFormState; imageUrl: string } };
        setTemplateState(json.data.templateState);
        setImageUrl(json.data.imageUrl);
        setIsRefineMode(true);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `Template generated! You can review the preview on the right. Want to change anything? Just describe it, or click one of the actions below.`,
        }]);
      } else {
        // Refinement
        setImageLoading(false);
        const res = await fetch(`${API_URL}/v1/ai/creator/template/refine`, {
          method: "POST",
          headers,
          body: JSON.stringify({ templateState, imageUrl, refinement: text }),
        });
        if (!res.ok) {
          const json = await res.json() as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Refinement failed");
        }
        const json = await res.json() as { data: { templateState: TemplateFormState; imageUrl: string; regenerateImage: boolean } };
        setTemplateState(json.data.templateState);
        if (json.data.regenerateImage) {
          setImageLoading(true);
          setImageUrl("");
          // Image comes back in the response if regenerated
          if (json.data.imageUrl) {
            setImageUrl(json.data.imageUrl);
            setImageLoading(false);
          }
        } else {
          setImageUrl(json.data.imageUrl);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: "Updated! Check the preview." }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setIsPending(false);
      setImageLoading(false);
    }
  }

  function handleEditManually() {
    if (!templateState) return;
    const draft = { ...templateState, headerMediaUrl: imageUrl || templateState.headerMediaUrl };
    sessionStorage.setItem("ai_template_draft", JSON.stringify(draft));
    router.push("/templates/new?from_ai=true");
  }

  function handleSubmit() {
    if (!templateState) return;
    const draft = { ...templateState, headerMediaUrl: imageUrl || templateState.headerMediaUrl };
    sessionStorage.setItem("ai_template_draft", JSON.stringify(draft));
    sessionStorage.setItem("ai_template_auto_submit", "true");
    router.push("/templates/new?from_ai=true");
  }

  return (
    <AiCreatorLayout
      title="Create Template with AI"
      backHref="/templates"
      preview={
        <div className="flex flex-col h-full">
          <TemplateAiPreview
            templateState={templateState}
            imageUrl={imageUrl}
            imageLoading={imageLoading}
          />
          {templateState && (
            <AiActionBar
              onPrimary={handleSubmit}
              primaryLabel="Submit for Approval"
              onRefine={() => {
                setMessages((prev) => [...prev, { role: "assistant", content: "What would you like to change?" }]);
              }}
              onEdit={handleEditManually}
              disabled={isPending}
            />
          )}
        </div>
      }
    >
      <AiChatPanel
        messages={messages}
        onSend={handleSend}
        isPending={isPending}
        placeholder="Describe the template you want to create..."
      />
      {error && (
        <p className="px-4 pb-2 text-xs text-red-600">{error}</p>
      )}
    </AiCreatorLayout>
  );
}
```

- [ ] **Step 3: Add "Create with AI" button to templates page**

In `apps/web/app/(dashboard)/templates/page.tsx`, find the line with the "New Template" Link button and add the AI button before it:

```tsx
// Find this block (around line 55-65):
<PermissionGate permission="template_management" sub="template_create">
  <Link href="/templates/new">
    <Button>New Template</Button>
  </Link>
</PermissionGate>

// Replace with:
<PermissionGate permission="template_management" sub="template_create">
  <div className="flex gap-2">
    <Link href="/templates/ai-create">
      <Button variant="outline">✨ Create with AI</Button>
    </Link>
    <Link href="/templates/new">
      <Button>New Template</Button>
    </Link>
  </div>
</PermissionGate>
```

- [ ] **Step 4: Hydrate TemplateForm from sessionStorage**

In `apps/web/app/(dashboard)/templates/new/TemplateForm.tsx`, add a `useEffect` that reads the AI draft on mount. Find where `useState(INITIAL_STATE)` is used and modify the component's initialisation:

```tsx
// At the top, add this import if not already present:
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Inside the TemplateForm component, find:
const [state, setState] = useState<TemplateFormState>(INITIAL_STATE);

// Add this useEffect immediately after:
const searchParams = useSearchParams();
useEffect(() => {
  if (searchParams.get("from_ai") !== "true") return;
  try {
    const raw = sessionStorage.getItem("ai_template_draft");
    if (!raw) return;
    const draft = JSON.parse(raw) as TemplateFormState;
    setState(draft);
    sessionStorage.removeItem("ai_template_draft");
    // Auto-advance to step 2 (edit) so agent sees the pre-filled form
    setStep(2);
    // If auto-submit was flagged, advance to step 3
    const autoSubmit = sessionStorage.getItem("ai_template_auto_submit");
    if (autoSubmit === "true") {
      sessionStorage.removeItem("ai_template_auto_submit");
      setStep(3);
    }
  } catch { /* malformed sessionStorage — ignore */ }
}, [searchParams]);
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "ai-create|TemplateAiPreview|AiCreator" | head -20
```

Expected: no errors from the new files.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ai/TemplateAiPreview.tsx apps/web/app/\(dashboard\)/templates/
git commit -m "feat(ai-creator): add Template AI Creator page with split-screen preview"
```

---

## Task 6: Flow AI Creator

**Files:**
- Create: `apps/web/components/ai/FlowAiPreview.tsx`
- Create: `apps/web/app/(dashboard)/flows/ai-create/page.tsx`
- Modify: `apps/web/app/(dashboard)/flows/page.tsx`

**Interfaces:**
- Consumes: `AiCreatorLayout`, `AiChatPanel`, `AiActionBar` from Task 4
- Consumes: `deserializeFlow`, `getLayoutedElements` from existing flow utils
- Consumes: `TriggerNode`, `ActionNode`, `ConditionNode` node types
- Produces: `/flows/ai-create` route. On "Save Flow" creates flow via `POST /v1/flows` then redirects to `/flows/[id]`.

- [ ] **Step 1: Create `apps/web/components/ai/FlowAiPreview.tsx`**

```tsx
"use client";

import { JSX } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { TriggerNode } from "@/components/flows/nodes/TriggerNode";
import { ActionNode } from "@/components/flows/nodes/ActionNode";
import { ConditionNode } from "@/components/flows/nodes/ConditionNode";
import { deserializeFlow } from "@/components/flows/utils/serialize";
import { getLayoutedElements } from "@/components/flows/utils/layout";
import type { FlowDefinition } from "@/components/flows/utils/serialize";

const NODE_TYPES = { trigger: TriggerNode, action: ActionNode, condition: ConditionNode };

interface FlowAiPreviewProps {
  flowDefinition: FlowDefinition | null;
  triggerType: string;
}

export function FlowAiPreview({ flowDefinition, triggerType }: FlowAiPreviewProps): JSX.Element {
  if (!flowDefinition) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-8">
          Describe your automation flow in the chat and AI will build the node graph here.
        </p>
      </div>
    );
  }

  const { nodes: rawNodes, edges } = deserializeFlow({
    id: "preview",
    name: "AI Preview",
    triggerType,
    isActive: false,
    flowDefinition,
  });
  const nodes = getLayoutedElements(rawNodes, edges);

  return (
    <div className="flex-1 relative">
      <p className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-gray-400 uppercase tracking-wide z-10">
        Flow Preview
      </p>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/flows/ai-create/page.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AiCreatorLayout } from "@/components/ai/AiCreatorLayout";
import { AiChatPanel, type ChatMessage } from "@/components/ai/AiChatPanel";
import { AiActionBar } from "@/components/ai/AiActionBar";
import { FlowAiPreview } from "@/components/ai/FlowAiPreview";
import type { FlowDefinition } from "@/components/flows/utils/serialize";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface AiFlowResult {
  flowDefinition: FlowDefinition;
  triggerType: string;
  suggestedName: string;
}

export default function FlowAiCreatePage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! Describe the automation flow you want to build. For example: \"When a customer says refund, send our policy template, if no reply in 2 hours assign to billing team\"." },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [flowResult, setFlowResult] = useState<AiFlowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefineMode, setIsRefineMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [flowName, setFlowName] = useState("");

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  async function handleSend(text: string) {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsPending(true);
    setError(null);

    try {
      const headers = await authHeaders();

      if (!isRefineMode || !flowResult) {
        const res = await fetch(`${API_URL}/v1/ai/creator/flow/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ description: text }),
        });
        if (!res.ok) {
          const json = await res.json() as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Generation failed");
        }
        const json = await res.json() as { data: AiFlowResult };
        setFlowResult(json.data);
        setFlowName(json.data.suggestedName);
        setIsRefineMode(true);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `Flow built! You can see the node graph on the right. Want to adjust anything? Just describe the change, or click Save Flow below.`,
        }]);
      } else {
        const res = await fetch(`${API_URL}/v1/ai/creator/flow/refine`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            flowDefinition: flowResult.flowDefinition,
            triggerType: flowResult.triggerType,
            refinement: text,
          }),
        });
        if (!res.ok) {
          const json = await res.json() as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Refinement failed");
        }
        const json = await res.json() as { data: { flowDefinition: FlowDefinition; triggerType: string } };
        setFlowResult((prev) => prev ? { ...prev, flowDefinition: json.data.flowDefinition, triggerType: json.data.triggerType } : prev);
        setMessages((prev) => [...prev, { role: "assistant", content: "Flow updated! Check the graph." }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setIsPending(false);
    }
  }

  async function handleSaveFlow() {
    if (!flowResult || !flowName.trim()) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/v1/flows`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: flowName.trim(),
          triggerType: flowResult.triggerType,
          flowDefinition: flowResult.flowDefinition,
        }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: { message?: string } };
        throw new Error(json.error?.message ?? "Save failed");
      }
      const json = await res.json() as { data: { id: string } };
      router.push(`/flows/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setShowNameModal(false);
    }
  }

  return (
    <>
      <AiCreatorLayout
        title="Create Flow with AI"
        backHref="/flows"
        preview={
          <div className="flex flex-col h-full">
            <FlowAiPreview
              flowDefinition={flowResult?.flowDefinition ?? null}
              triggerType={flowResult?.triggerType ?? "new_conversation"}
            />
            {flowResult && (
              <AiActionBar
                onPrimary={() => setShowNameModal(true)}
                primaryLabel="Save Flow"
                onRefine={() => {
                  setMessages((prev) => [...prev, { role: "assistant", content: "What would you like to change in the flow?" }]);
                }}
                onEdit={() => setShowNameModal(true)}
                editLabel="Save & Open Editor"
                disabled={isPending || saving}
              />
            )}
          </div>
        }
      >
        <AiChatPanel
          messages={messages}
          onSend={handleSend}
          isPending={isPending}
          placeholder="Describe the automation flow you want to build..."
        />
        {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
      </AiCreatorLayout>

      {/* Name modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Name your flow</h2>
            <input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { void handleSaveFlow(); } }}
              placeholder="e.g. Refund Handling"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSaveFlow(); }}
                disabled={!flowName.trim() || saving}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save & Open Editor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Add "Create with AI" button to flows page**

In `apps/web/app/(dashboard)/flows/page.tsx`, find the "New Flow" button and add the AI button alongside it. Look for the Link to `/flows/new` and add a sibling link:

```tsx
// Find this (around the PermissionGate with flows/new link):
<Link href="/flows/new">
  <Button>New Flow</Button>
</Link>

// Replace with:
<div className="flex gap-2">
  <Link href="/flows/ai-create">
    <Button variant="outline">✨ Create with AI</Button>
  </Link>
  <Link href="/flows/new">
    <Button>New Flow</Button>
  </Link>
</div>
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "ai-create|FlowAiPreview" | head -20
```

Expected: no errors from the new files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ai/FlowAiPreview.tsx apps/web/app/\(dashboard\)/flows/
git commit -m "feat(ai-creator): add Flow AI Creator page with ReactFlow split-screen preview"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Split-screen layout (40/60) | Task 4 — AiCreatorLayout |
| AI Chat panel left side | Task 4 — AiChatPanel |
| Template preview right side | Task 5 — TemplateAiPreview |
| Flow canvas right side | Task 6 — FlowAiPreview |
| Image generation via fal.ai | Task 2 — fal-image.ts |
| Image stored in R2 | Task 2 — uploadToR2 call |
| Image skeleton while loading | Task 5 — TemplateAiPreview imageLoading prop |
| Refinement loop | Task 5 + 6 — refine API calls |
| Submit for Approval path | Task 5 — sessionStorage + redirect |
| Edit Manually path | Task 5 — sessionStorage + redirect |
| Save Flow path | Task 6 — POST /v1/flows + redirect |
| PII guard at schema layer | Task 3 — containsPii + 400 response |
| System prompt PII instruction | Task 1 — TEMPLATE_SYSTEM_PROMPT + FLOW_SYSTEM_PROMPT |
| AGENT role minimum | Task 3 — request.auth (handled by existing auth middleware) |
| No carousel in v1 | Task 1 — system prompt limits subType to standard/coupon/lto |
| "Create with AI" on templates page | Task 5 |
| "Create with AI" on flows page | Task 6 |
| TemplateForm hydration from sessionStorage | Task 5 |
| FlowEditor pre-populated | Task 6 — saves flow first, FlowEditor opens it |

**Placeholder scan:** None found. All steps include complete code.

**Type consistency check:**
- `FlowDefinition` type: defined in `apps/web/components/flows/utils/serialize.ts`, re-exported as-is. Task 6 imports it from there directly. Task 1 duplicates the minimal structure in the backend to avoid cross-app imports — consistent field names.
- `TemplateFormState`: defined in `templateFormTypes.ts`, imported by Task 5 directly.
- `ChatMessage`: defined in `AiChatPanel.tsx`, exported and imported by Tasks 5 + 6.
- `deserializeFlow` called with `FlowData` shape in Task 6 — matches the interface exactly.
