import { normalizeFullPhone } from "../phone-normalize.js";
import type { WaInteractivePayload, WaTemplateComponent } from "../whatsapp.js";

export const MAX_DST = 20;
export const MAX_TEXT = 4096;

export class SendValidationError extends Error {}

export interface PlivoTemplateComponent {
  type: string;
  sub_type?: string;
  index?: string | number;
  parameters?: Array<{ type: string; text?: string; media?: string; payload?: string }>;
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
    content = { kind: "template", name, language, components: Array.isArray(t["components"]) ? (t["components"] as PlivoTemplateComponent[]) : [] };
  } else if (isObj(body["interactive"])) {
    content = { kind: "interactive", interactive: body["interactive"] as unknown as PlivoInteractive };
  } else if (isObj(body["location"])) {
    const l = body["location"];
    const [latitude, longitude, name, address] = ["latitude", "longitude", "name", "address"].map((k) => (l[k] == null ? null : String(l[k]))) as Array<string | null>;
    if (!latitude || !longitude || !name || !address || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
      throw new SendValidationError("location requires numeric latitude and longitude plus name and address");
    }
    content = { kind: "location", latitude, longitude, name, address };
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

export function toMetaTemplateComponents(components: PlivoTemplateComponent[], headerFormat: string | null): WaTemplateComponent[] {
  return components.map((c) => {
    const type = c.type?.toLowerCase();
    if (type !== "header" && type !== "body" && type !== "button") {
      throw new SendValidationError(`Unsupported template component type: ${c.type}`);
    }
    const parameters = (c.parameters ?? []).map((p): MetaParam => {
      if (p.type === "media") {
        const f = (headerFormat ?? "IMAGE").toLowerCase();
        const kind = f === "video" || f === "document" ? f : "image";
        return { type: kind, [kind]: { link: p.media ?? "" } } as MetaParam;
      }
      if (p.type === "payload") return { type: "payload", payload: p.payload ?? "" };
      return { type: "text", text: p.text ?? "" };
    });
    return {
      type,
      ...(c.sub_type ? { sub_type: c.sub_type } : {}),
      ...(c.index !== undefined ? { index: Number(c.index) } : {}),
      parameters,
    };
  });
}

/** PROVISIONAL: shapes follow Plivo's docs examples; confirm against the client's real interactive requests. */
export function toMetaInteractive(i: PlivoInteractive): WaInteractivePayload {
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
  if (i.type === "list") {
    if (i.action.sections) return { type: "list", ...common, action: { button: i.action.button ?? "Options", sections: i.action.sections } };
    const rows = (i.action.lists ?? []).map((r) => ({ id: r.id, title: r.title }));
    return { type: "list", ...common, action: { button: i.action.button ?? "Options", sections: [{ title: "Options", rows }] } };
  }
  throw new SendValidationError(`Unsupported interactive type: ${i.type}`);
}

type StoredComp = { type?: string; format?: string; text?: string; buttons?: unknown[] };

/** Same JSON shape the inbox already renders for template messages (see routes/messages.ts renderedBody). */
export function renderTemplateForInbox(name: string, stored: unknown[], components: PlivoTemplateComponent[]): string {
  const comps = stored as StoredComp[];
  const find = (t: string) => comps.find((c) => c.type?.toUpperCase() === t);
  let body = find("BODY")?.text ?? "";
  const bodyParams = components.find((c) => c.type?.toLowerCase() === "body")?.parameters ?? [];
  bodyParams.forEach((p, idx) => { body = body.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g"), p.text ?? ""); });
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
