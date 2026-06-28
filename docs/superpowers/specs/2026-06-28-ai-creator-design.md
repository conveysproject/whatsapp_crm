# AI Creator — Template & Flow Generation
**Date:** 2026-06-28
**Status:** Approved

## Overview

A split-screen AI assistant that lets agents describe a WhatsApp template or automation flow in plain language and get a fully-generated, ready-to-submit result in seconds. Covers two creation tasks: **Templates** (with AI-generated header image) and **Flows** (automation node graphs).

**Hard constraint:** Zero customer/contact PII ever crosses the AI API boundary. No names, phone numbers, message history, or contact records are sent to any AI service. The AI works on business intent only.

---

## Entry Points

- **Templates page** (`/templates`): "Create with AI" button alongside existing "New Template"
- **Flows page** (`/flows`): "Create with AI" button alongside existing "New Flow"

Clicking either button transforms the page into split-screen AI Creator mode.

---

## Layout

```
┌────────────────────┬────────────────────────┐
│   AI Chat (40%)    │   Live Preview (60%)   │
│                    │                        │
│  [conversation]    │  [template preview]    │
│                    │  or [flow canvas]      │
│                    │                        │
│  [type here...]    │  ──────────────────    │
│                    │  [Submit] [Refine]     │
│                    │  [Edit Manually]       │
└────────────────────┴────────────────────────┘
```

- **Left (40%):** `AiChatPanel` — message thread, input box, loading/streaming states
- **Right (60%):** `TemplateAiPreview` or `FlowAiPreview` — live-updating as AI generates
- **Bottom-right:** `AiActionBar` — appears once generation is complete
- **Escape / Back:** returns to normal page, discards unsaved AI output

---

## Template AI Creation

### User flow
1. Agent types a description: *"30% off Eid sale, Shop Now button, marketing"*
2. API call to `POST /ai/template/generate`
3. Claude generates `TemplateFormState` JSON (~2s) — preview populates immediately
4. Simultaneously, Claude generates an image prompt → `POST /ai/template/image` → fal.ai `flux/schnell` (~5–8s)
5. Header image fills in when ready; a skeleton placeholder shows while loading
6. `AiActionBar` appears: **Submit for Approval** | **Refine with AI** | **Edit Manually**

### Refinement
- Agent types: *"Make the body shorter"* or *"Change image to show a clothing store"*
- API call to `POST /ai/template/refine` with current state + refinement instruction
- If `regenerateImage: true` in response → re-triggers fal.ai
- Preview updates in place; chat thread accumulates the conversation

### Exit paths
- **Submit for Approval:** pre-fills existing `/templates/new` form with AI state → agent confirms → submits to Meta API
- **Edit Manually:** serializes AI state to `sessionStorage` → navigates to `/templates/new` → `TemplateForm` hydrates from storage
- **Back:** discards, returns to `/templates`

### Template fields AI populates
`name`, `category`, `language`, `subType`, `headerType`, `headerText` (or image URL), `bodyText`, `footerText`, `buttons[]`, `variableExamples`

---

## Flow AI Creation

### User flow
1. Agent types a description: *"When customer says refund, send refund policy template, if no reply in 2 hours assign to billing team"*
2. API call to `POST /ai/flow/generate`
3. Claude generates `{ nodes: Node[], edges: Edge[] }` compatible with ReactFlow (~3s)
4. `FlowAiPreview` renders the read-only canvas — nodes appear positioned and connected
5. `AiActionBar` appears: **Save Flow** | **Refine with AI** | **Edit in Editor**

### Refinement
- Agent types: *"Add a 1-hour delay before the follow-up"*
- API call to `POST /ai/flow/refine` with current nodes/edges + instruction
- Canvas re-renders with updated graph

### Exit paths
- **Save Flow:** serializes AI nodes/edges to `sessionStorage` → navigates to `/flows/new` → `FlowEditor` hydrates, agent names and saves
- **Edit in Editor:** same as Save Flow but agent makes manual edits first
- **Back:** discards, returns to `/flows`

### Node types AI can generate
| Type | Variants |
|------|----------|
| TriggerNode | keyword_match, inbound_message, new_conversation, no_reply, button_reply, contact_created, tag_added |
| ActionNode | send_template, send_message, assign_agent, resolve_conversation, add_tag, wait_delay |
| ConditionNode | if/else branching on reply content, button clicked, tag present |

---

## Backend API

All routes: `apps/api/src/routes/ai/`
Auth: valid session + minimum `AGENT` role (existing RBAC)

### Routes

| Method + Path | Request body | Response |
|---------------|-------------|----------|
| `POST /ai/template/generate` | `{ description: string }` | `{ templateState: TemplateFormState, imagePrompt: string }` |
| `POST /ai/template/refine` | `{ templateState: TemplateFormState, imageUrl: string, refinement: string }` | `{ templateState: TemplateFormState, regenerateImage: boolean, imagePrompt?: string }` |
| `POST /ai/template/image` | `{ prompt: string }` | `{ imageUrl: string }` |
| `POST /ai/flow/generate` | `{ description: string }` | `{ nodes: Node[], edges: Edge[] }` |
| `POST /ai/flow/refine` | `{ nodes: Node[], edges: Edge[], refinement: string }` | `{ nodes: Node[], edges: Edge[] }` |

### AI model
Claude `claude-sonnet-4-6` — structured JSON output mode for all template/flow generation.

### Image generation
fal.ai `fal-ai/flux/schnell` — sub-5s per image, ~$0.003/image. API key stored in Railway env as `FAL_API_KEY`. Generated images are uploaded to **Cloudflare R2** (via `apps/api/src/lib/r2.ts`) so the URL is permanent before Meta submission.

---

## PII Safety Architecture

**Enforced at the API layer — not just by convention.**

1. **System prompt** for all AI calls: *"You are a WhatsApp template and flow builder assistant. You work only with business intent descriptions provided by the agent. Never request, infer, use, or store customer names, phone numbers, email addresses, message content, or any personal data. If any personal data appears in the input, ignore it completely."*

2. **Request schema validation:** Zod schemas on all `/ai/*` routes reject any field containing contact IDs, conversation IDs, phone number patterns, or email patterns. Request is rejected 400 before reaching the AI if validation fails.

3. **No conversation context:** These routes have no access to the conversations/contacts database. They are pure generation endpoints.

4. **No AI training leakage:** Claude API is called without `allow_model_training` — Anthropic's default for API usage. No opt-in to training.

---

## Component Architecture

All new components in `apps/web/components/ai/`:

| Component | Responsibility |
|-----------|---------------|
| `AiCreatorLayout` | Split-screen wrapper; owns chat history state and current generated artifact (templateState or flow nodes) |
| `AiChatPanel` | Left panel — renders message thread, input box, sends API calls, streams loading state |
| `AiActionBar` | Bottom-right — Submit/Save, Refine, Edit Manually buttons; hidden until first generation completes |
| `TemplateAiPreview` | Right panel for templates — feeds live `templateState` into existing `TemplatePreview.tsx`; shows image skeleton while generating |
| `FlowAiPreview` | Right panel for flows — read-only ReactFlow canvas, auto-layout AI-generated nodes |

**State management:** Local React state in `AiCreatorLayout`. No global store needed.

**Data handoff to existing editors:**
- `sessionStorage` key `ai_template_draft` → `TemplateForm` reads on mount
- `sessionStorage` key `ai_flow_draft` → `FlowEditor` reads on mount

---

## What This Is Not

- Does not read or display any customer/contact data
- Does not send any conversation history to AI
- Does not replace the existing TemplateForm or FlowEditor — it pre-fills them
- Does not handle campaign creation, deal creation, or reply drafting (future scope)
- Does not generate carousel templates in v1 (complex; add later)
