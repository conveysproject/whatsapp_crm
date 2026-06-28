import Anthropic from "@anthropic-ai/sdk";

// TemplateFormState is defined locally to avoid cross-app imports (apps/web cannot be imported from apps/api).
type TemplateFormState = Record<string, unknown>;

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
