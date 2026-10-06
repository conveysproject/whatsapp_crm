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

export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: MetaTemplateButton[];
}

interface SubmitResult {
  metaTemplateId: string;
  status: "pending";
}

/** A Meta template call failed. Carries Meta's numeric code only: never Meta's text, the request, or the access token. */
export class MetaTemplateError extends Error {
  constructor(message: string, public readonly code: number | null, public readonly status: number) {
    super(message);
    this.name = "MetaTemplateError";
  }
}

// Meta answers a delete of an already-removed template with code 100 and one of these subcodes.
const TEMPLATE_NOT_FOUND_SUBCODES = [2593002, 33];

async function readMetaError(res: Response): Promise<{ code: number | null; subcode: number | null }> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown; error_subcode?: unknown } } | null;
    const code = body?.error?.code;
    const subcode = body?.error?.error_subcode;
    return { code: typeof code === "number" ? code : null, subcode: typeof subcode === "number" ? subcode : null };
  } catch {
    return { code: null, subcode: null };
  }
}

const withCode = (what: string, code: number | null) => (code === null ? what : `${what} (code ${code})`);

/** fetch wrapper: network failures become a MetaTemplateError (the raw error text is dropped). */
async function metaFetch(what: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new MetaTemplateError(`${what}: network error`, null, 0);
  }
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

export async function submitTemplateToMeta(opts: {
  wabaId: string;
  accessToken: string;
  name: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
  allowCategoryChange?: boolean;
}): Promise<SubmitResult> {
  const what = "Meta template submission failed";
  const res = await metaFetch(what, `${WA_BASE}/${opts.wabaId}/message_templates`, {
    method: "POST",
    headers: authHeaders(opts.accessToken),
    body: JSON.stringify({
      name: opts.name.toLowerCase().replace(/\s+/g, "_"),
      category: opts.category.toUpperCase(),
      language: opts.language,
      components: opts.components,
      ...(opts.allowCategoryChange ? { allow_category_change: true } : {}),
    }),
  });
  if (!res.ok) {
    const { code } = await readMetaError(res);
    throw new MetaTemplateError(withCode(what, code), code, res.status);
  }
  const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
  if (!data || (typeof data.id !== "string" && typeof data.id !== "number")) {
    throw new MetaTemplateError(`${what}: no template id returned`, null, res.status);
  }
  return { metaTemplateId: String(data.id), status: "pending" };
}

/** Edits an existing template's components at Meta (POST /{template-id}). Meta puts it back into review. */
export async function editTemplateOnMeta(opts: {
  accessToken: string;
  metaTemplateId: string;
  components: object[];
  category?: string;
}): Promise<void> {
  const what = "Meta template edit failed";
  const res = await metaFetch(what, `${WA_BASE}/${encodeURIComponent(opts.metaTemplateId)}`, {
    method: "POST",
    headers: authHeaders(opts.accessToken),
    body: JSON.stringify({ components: opts.components, ...(opts.category ? { category: opts.category.toUpperCase() } : {}) }),
  });
  if (!res.ok) {
    const { code } = await readMetaError(res);
    throw new MetaTemplateError(withCode(what, code), code, res.status);
  }
  const data = (await res.json().catch(() => null)) as { success?: unknown } | null;
  if (data?.success === false) throw new MetaTemplateError(what, null, res.status);
}

/**
 * Deletes a template at Meta by name + hsm_id (the documented call). Resolves when Meta says it is already gone,
 * so a retry after a half-finished delete can complete.
 */
export async function deleteTemplateOnMeta(opts: {
  wabaId: string;
  accessToken: string;
  name: string;
  metaTemplateId: string;
}): Promise<void> {
  const what = "Meta template delete failed";
  const url = `${WA_BASE}/${encodeURIComponent(opts.wabaId)}/message_templates?name=${encodeURIComponent(opts.name)}&hsm_id=${encodeURIComponent(opts.metaTemplateId)}`;
  const res = await metaFetch(what, url, { method: "DELETE", headers: { Authorization: `Bearer ${opts.accessToken}` } });
  if (!res.ok) {
    const { code, subcode } = await readMetaError(res);
    if (code === 100 && subcode !== null && TEMPLATE_NOT_FOUND_SUBCODES.includes(subcode)) return;
    throw new MetaTemplateError(withCode(what, code), code, res.status);
  }
  const data = (await res.json().catch(() => null)) as { success?: unknown } | null;
  if (data?.success === false) throw new MetaTemplateError(what, null, res.status);
}
