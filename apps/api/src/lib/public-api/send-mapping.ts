import { normalizeFullPhone } from "../phone-normalize.js";
import type { WaInteractivePayload, WaTemplateComponent } from "../whatsapp.js";

export const MAX_DST = 20;
export const MAX_TEXT = 4096;

export class SendValidationError extends Error {}

export interface PlivoTemplateComponent {
  type: string;
  sub_type?: string;
  index?: string | number;
  parameters?: Array<{ type: string; text?: string; media?: string; payload?: string; parameter_name?: string }>;
}

export interface PlivoInteractive {
  type: string;
  header?: { type: string; media?: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{ title: string; id?: string; cta_url?: string }>;
    lists?: Array<{ title: string; id: string }>;
    button?: string;
    sections?: unknown[];
  };
}

export type SendContent =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaUrl: string; caption: string | null }
  | { kind: "template"; name: string; language: string; components: PlivoTemplateComponent[] }
  | { kind: "location"; latitude: string; longitude: string; name: string; address: string }
  | { kind: "interactive"; interactive: PlivoInteractive };

export interface ParsedSend {
  src: string;
  dsts: string[];
  callbackUrl: string | null;
  callbackMethod: "GET" | "POST";
  content: SendContent;
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function inferMediaKind(url: string): "image" | "video" | "document" | "audio" {
  const ext = (/\.([a-z0-9]+)(?:$|[?#])/i.exec(url)?.[1] ?? "").toLowerCase();
  if (["mp4", "3gp", "mov"].includes(ext)) return "video";
  if (["mp3", "ogg", "aac", "amr", "m4a"].includes(ext)) return "audio";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)) return "document";
  return "image";
}

export function parseSendBody(body: unknown): ParsedSend {
  if (!isObj(body)) throw new SendValidationError("Request body must be a JSON object");
  if (body["type"] !== "whatsapp") throw new SendValidationError("Only type=whatsapp is supported");

  const src = normalizeFullPhone(str(body["src"]) ?? "");
  if (!src) throw new SendValidationError("src must be a valid WhatsApp Business number");

  const rawDst = str(body["dst"]);
  if (!rawDst) throw new SendValidationError("dst is required");
  const dsts: string[] = [];
  for (const part of rawDst.split("<")) {
    const n = normalizeFullPhone(part.trim());
    if (!n) throw new SendValidationError(`Invalid destination number: ${part.trim() || "(empty)"}`);
    if (!dsts.includes(n)) dsts.push(n);
  }
  if (dsts.length > MAX_DST) throw new SendValidationError(`At most ${MAX_DST} destinations per request`);

  const callbackUrl = str(body["url"]);
  const callbackMethod = String(body["method"] ?? "POST").toUpperCase() === "GET" ? "GET" : "POST";

  const text = typeof body["text"] === "string" ? body["text"] : null;
  const mediaRaw = body["media_urls"];
  const media = Array.isArray(mediaRaw) ? mediaRaw : mediaRaw != null ? [mediaRaw] : [];
  const kinds = [body["template"] != null, body["interactive"] != null, body["location"] != null, media.length > 0];
  if (kinds.filter(Boolean).length > 1 || (kinds.some(Boolean) && text !== null && media.length === 0)) {
    throw new SendValidationError("Send exactly one of text, media_urls, template, interactive or location");
  }
  if (text !== null && text.length > MAX_TEXT) throw new SendValidationError(`text must be at most ${MAX_TEXT} characters`);

  let content: SendContent;
  if (isObj(body["template"])) {
    const t = body["template"];
    const name = str(t["name"]); const language = str(t["language"]);
    if (!name || !language) throw new SendValidationError("template.name and template.language are required");
    content = { kind: "template", name, language, components: validateComponents(t["components"]) };
  } else if (isObj(body["interactive"])) {
    content = { kind: "interactive", interactive: validateInteractive(body["interactive"]) };
  } else if (isObj(body["location"])) {
    const l = body["location"];
    const [latitude, longitude, name, address] = ["latitude", "longitude", "name", "address"].map((k) => (l[k] == null ? null : String(l[k]))) as Array<string | null>;
    if (!latitude || !longitude || !name || !address || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
      throw new SendValidationError("location requires numeric latitude and longitude plus name and address");
    }
    content = { kind: "location", latitude, longitude, name, address };
  } else if (body["template"] != null || body["interactive"] != null || body["location"] != null) {
    throw new SendValidationError("template, interactive and location must be JSON objects");
  } else if (media.length > 0) {
    if (media.length > 1) throw new SendValidationError("WhatsApp messages accept a single media URL");
    const url = str(media[0]);
    if (!url || !url.startsWith("https://")) throw new SendValidationError("media_urls must be an https URL");
    content = { kind: "media", mediaUrl: url, caption: text?.trim() ? text.trim() : null };
  } else {
    if (!text?.trim()) throw new SendValidationError("text is required");
    content = { kind: "text", text: text.trim() };
  }
  return { src, dsts, callbackUrl, callbackMethod, content };
}

type MetaParam = NonNullable<WaTemplateComponent["parameters"]>[number];

const bad = (msg: string): never => { throw new SendValidationError(msg); };

/** Validates untrusted template components; throws SendValidationError on any malformed shape. */
function validateComponents(raw: unknown): PlivoTemplateComponent[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return bad("template.components must be an array");
  const out = raw.map((c: unknown, ci): PlivoTemplateComponent => {
    if (!isObj(c) || typeof c["type"] !== "string") return bad(`template.components[${ci}] must be an object with a string type`);
    const rawParams = c["parameters"];
    if (rawParams !== undefined && !Array.isArray(rawParams)) return bad(`template.components[${ci}].parameters must be an array`);
    const parameters = ((rawParams ?? []) as unknown[]).map((p, pi) => {
      const at = `template.components[${ci}].parameters[${pi}]`;
      if (!isObj(p) || typeof p["type"] !== "string") return bad(`${at} must be an object with a string type`);
      if (p["type"] === "text") {
        if (typeof p["text"] !== "string") return bad(`${at}.text must be a string`);
        if (p["text"].trim() === "") return bad(`${at}.text must not be empty`);
        const pn = p["parameter_name"];
        if (pn !== undefined) {
          if (typeof pn !== "string" || !/^[A-Za-z0-9_]{1,64}$/.test(pn)) return bad(`${at}.parameter_name must be 1-64 letters, digits or underscores`);
          return { type: "text", text: p["text"], parameter_name: pn };
        }
        return { type: "text", text: p["text"] };
      }
      if (p["type"] === "payload") {
        if (typeof p["payload"] !== "string") return bad(`${at}.payload must be a string`);
        return { type: "payload", payload: p["payload"] };
      }
      if (p["type"] === "media") {
        const m = p["media"];
        if (typeof m !== "string" || !m.startsWith("https://")) return bad(`${at}.media must be an https URL`);
        return { type: "media", media: m };
      }
      return bad(`${at}.type must be one of text, media, payload`);
    });
    const out: PlivoTemplateComponent = { type: c["type"], parameters };
    if (c["sub_type"] !== undefined) {
      if (typeof c["sub_type"] !== "string") return bad(`template.components[${ci}].sub_type must be a string`);
      out.sub_type = c["sub_type"];
    }
    if (c["index"] !== undefined) {
      const ix = c["index"];
      if ((typeof ix !== "string" && typeof ix !== "number") || (typeof ix === "string" && ix.trim() === "") || !Number.isInteger(Number(ix))) {
        return bad(`template.components[${ci}].index must be an integer`);
      }
      out.index = ix;
    }
    return out;
  });
  for (const t of ["header", "body"]) {
    if (out.filter((c) => c.type.toLowerCase() === t).length > 1) return bad(`template.components has more than one ${t} component`);
  }
  return out;
}

export function toMetaTemplateComponents(components: PlivoTemplateComponent[], headerFormat: string | null): WaTemplateComponent[] {
  return validateComponents(components).map((c) => {
    const type = c.type.toLowerCase();
    if (type !== "header" && type !== "body" && type !== "button") {
      throw new SendValidationError(`Unsupported template component type: ${c.type}`);
    }
    const parameters = (c.parameters ?? []).map((p): MetaParam => {
      if (p.type === "media") {
        const f = (headerFormat ?? "IMAGE").toLowerCase();
        const kind = f === "video" || f === "document" ? f : "image";
        return { type: kind, [kind]: { link: p.media as string } } as MetaParam;
      }
      if (p.type === "payload") return { type: "payload", payload: p.payload as string };
      return { type: "text", text: p.text as string, ...(p.parameter_name ? { parameter_name: p.parameter_name } : {}) };
    });
    return {
      type,
      ...(c.sub_type ? { sub_type: c.sub_type } : {}),
      ...(c.index !== undefined ? { index: Number(c.index) } : {}),
      parameters,
    };
  });
}

const INTERACTIVE_TYPES = ["button", "cta_url", "list"];

/** Validates an untrusted interactive object; throws SendValidationError on any malformed shape. */
function validateInteractive(raw: unknown): PlivoInteractive {
  if (!isObj(raw)) return bad("interactive must be an object");
  const type = raw["type"];
  if (typeof type !== "string" || !INTERACTIVE_TYPES.includes(type)) return bad(`Unsupported interactive type: ${String(type)}`);
  const body = raw["body"];
  if (!isObj(body) || typeof body["text"] !== "string") return bad("interactive.body.text must be a string");
  const action = raw["action"];
  if (!isObj(action)) return bad("interactive.action must be an object");

  const out: PlivoInteractive = { type, body: { text: body["text"] }, action: {} };
  const header = raw["header"];
  if (header !== undefined) {
    if (!isObj(header) || typeof header["type"] !== "string") return bad("interactive.header must be an object with a string type");
    if (header["media"] !== undefined && typeof header["media"] !== "string") return bad("interactive.header.media must be a string");
    out.header = { type: header["type"], ...(typeof header["media"] === "string" ? { media: header["media"] } : {}) };
  }
  const footer = raw["footer"];
  if (footer !== undefined) {
    if (!isObj(footer) || typeof footer["text"] !== "string") return bad("interactive.footer.text must be a string");
    out.footer = { text: footer["text"] };
  }
  if (action["button"] !== undefined) {
    if (typeof action["button"] !== "string") return bad("interactive.action.button must be a string");
    out.action.button = action["button"];
  }
  if (action["sections"] !== undefined) {
    if (!Array.isArray(action["sections"])) return bad("interactive.action.sections must be an array");
    out.action.sections = action["sections"];
  }
  const buttons = action["buttons"];
  if (buttons !== undefined) {
    if (!Array.isArray(buttons)) return bad("interactive.action.buttons must be an array");
    out.action.buttons = buttons.map((b: unknown, i) => {
      if (!isObj(b) || typeof b["title"] !== "string") return bad(`interactive.action.buttons[${i}] must be an object with a string title`);
      if (b["id"] !== undefined && typeof b["id"] !== "string") return bad(`interactive.action.buttons[${i}].id must be a string`);
      if (b["cta_url"] !== undefined && typeof b["cta_url"] !== "string") return bad(`interactive.action.buttons[${i}].cta_url must be a string`);
      return { title: b["title"], ...(typeof b["id"] === "string" ? { id: b["id"] } : {}), ...(typeof b["cta_url"] === "string" ? { cta_url: b["cta_url"] } : {}) };
    });
  }
  const lists = action["lists"];
  if (lists !== undefined) {
    if (!Array.isArray(lists)) return bad("interactive.action.lists must be an array");
    out.action.lists = lists.map((r: unknown, i) => {
      if (!isObj(r) || typeof r["title"] !== "string" || typeof r["id"] !== "string") return bad(`interactive.action.lists[${i}] must be an object with string id and title`);
      return { title: r["title"], id: r["id"] };
    });
  }
  return out;
}

/** PROVISIONAL: shapes follow Plivo's docs examples; confirm against the client's real interactive requests. */
export function toMetaInteractive(input: PlivoInteractive): WaInteractivePayload {
  const i = validateInteractive(input);
  const header = i.header?.type === "media" && i.header.media
    ? ({ type: inferMediaKind(i.header.media), [inferMediaKind(i.header.media)]: { link: i.header.media } } as WaInteractivePayload["header"])
    : undefined;
  const common = { ...(header ? { header } : {}), body: { text: i.body.text }, ...(i.footer ? { footer: { text: i.footer.text } } : {}) };
  if (i.type === "button") {
    return { type: "button", ...common, action: { buttons: (i.action.buttons ?? []).map((b) => ({ type: "reply", reply: { id: b.id ?? b.title, title: b.title } })) } };
  }
  if (i.type === "cta_url") {
    const b = i.action.buttons?.[0];
    if (!b?.cta_url) throw new SendValidationError("cta_url requires action.buttons[0].cta_url");
    return { type: "cta_url", ...common, action: { name: "cta_url", parameters: { display_text: b.title, url: b.cta_url } } };
  }
  if (i.action.sections) return { type: "list", ...common, action: { button: i.action.button ?? "Options", sections: i.action.sections } };
  const rows = (i.action.lists ?? []).map((r) => ({ id: r.id, title: r.title }));
  return { type: "list", ...common, action: { button: i.action.button ?? "Options", sections: [{ title: "Options", rows }] } };
}

type StoredComp = { type?: string; format?: string; text?: string; buttons?: unknown[] };

/** Same JSON shape the inbox already renders for template messages (see routes/messages.ts renderedBody). */
export function renderTemplateForInbox(name: string, stored: unknown[], components: PlivoTemplateComponent[]): string {
  const comps = stored as StoredComp[];
  const find = (t: string) => comps.find((c) => c.type?.toUpperCase() === t);
  let body = find("BODY")?.text ?? "";
  const bodyParams = components.find((c) => c.type?.toLowerCase() === "body")?.parameters ?? [];
  body = body.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    if (/^\d+$/.test(key)) return bodyParams[Number(key) - 1]?.text ?? "";
    return bodyParams.find((p) => p.parameter_name === key)?.text ?? "";
  });
  const header = find("HEADER");
  return JSON.stringify({
    templateName: name,
    header: header ? { format: header.format ?? "TEXT", text: header.text ?? null, mediaUrl: null } : null,
    body: body || name,
    footer: find("FOOTER")?.text ?? null,
    buttons: find("BUTTONS")?.buttons ?? [],
    carousel: null,
  });
}
