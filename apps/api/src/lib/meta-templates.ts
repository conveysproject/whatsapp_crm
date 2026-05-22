const WA_BASE = "https://graph.facebook.com/v25.0";

// GAP-S20: all valid WhatsApp template button types
export const TEMPLATE_BUTTON_TYPES = [
  "QUICK_REPLY",
  "PHONE_NUMBER",
  "URL",
  "VOICE_CALL",
  "DYNAMIC_URL",
  "COPY_CODE",
] as const;

export type TemplateButtonType = typeof TEMPLATE_BUTTON_TYPES[number];

interface MetaTemplateButton {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: MetaTemplateButton[];
}

interface SubmitResult {
  metaTemplateId: string;
  status: "pending";
}

export async function submitTemplateToMeta(opts: {
  wabaId: string;
  accessToken: string;
  name: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
}): Promise<SubmitResult> {
  const res = await fetch(`${WA_BASE}/${opts.wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.name.toLowerCase().replace(/\s+/g, "_"),
      category: opts.category.toUpperCase(),
      language: opts.language,
      components: opts.components,
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`Meta template submission failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { id: string; status: string };
  return { metaTemplateId: data.id, status: "pending" };
}
