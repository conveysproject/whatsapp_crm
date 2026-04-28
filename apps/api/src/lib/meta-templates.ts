const WA_BASE = "https://graph.facebook.com/v20.0";

interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
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
