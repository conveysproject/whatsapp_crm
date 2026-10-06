import { newApiId } from "./responses.js";

/** A client-input problem; the message is safe to return to the caller (it never echoes request values). */
export class TemplateValidationError extends Error {}

export type PublicTemplateCategory = "marketing" | "utility" | "authentication";
export type PublicTemplateStatus = "draft" | "pending" | "approved" | "rejected";

export interface ParsedTemplate {
  name: string;
  language: string;
  category: PublicTemplateCategory;
  components: object[];
  allowCategoryChange: boolean;
}

const NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[A-Za-z_]{2,15}$/;
const CATEGORIES: readonly PublicTemplateCategory[] = ["marketing", "utility", "authentication"];
const COMPONENT_TYPES = ["HEADER", "BODY", "FOOTER", "BUTTONS"];
const MEDIA_FORMATS = ["IMAGE", "VIDEO", "DOCUMENT"];
const MAX_BODY_TEXT = 1024;
const MAX_HEADER_FOOTER_TEXT = 60;
const MAX_BUTTONS = 10;
const MAX_COMPONENTS = 10;
const MAX_LIMIT = 20;
// Prisma `skip` must fit in int32; anything beyond this simply yields an empty page.
const MAX_OFFSET = 2_000_000_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function checkText(c: Record<string, unknown>, max: number, label: string): void {
  if (c["text"] === undefined) return;
  if (typeof c["text"] !== "string") throw new TemplateValidationError(`${label} text must be a string`);
  if (c["text"].length > max) throw new TemplateValidationError(`${label} text must be at most ${max} characters`);
}

function checkComponent(c: unknown): string {
  if (!isObj(c)) throw new TemplateValidationError("each component must be an object");
  if (typeof c["type"] !== "string") throw new TemplateValidationError("each component needs a type");
  const type = c["type"].toUpperCase();
  if (!COMPONENT_TYPES.includes(type)) throw new TemplateValidationError("unknown component type");
  if (type === "BODY") checkText(c, MAX_BODY_TEXT, "BODY");
  if (type === "FOOTER") checkText(c, MAX_HEADER_FOOTER_TEXT, "FOOTER");
  if (type === "HEADER") {
    checkText(c, MAX_HEADER_FOOTER_TEXT, "HEADER");
    const format = typeof c["format"] === "string" ? c["format"].toUpperCase() : "TEXT";
    if (MEDIA_FORMATS.includes(format)) {
      const handle = isObj(c["example"]) ? c["example"]["header_handle"] : undefined;
      if (!Array.isArray(handle) || handle.length === 0 || !handle.every((h) => typeof h === "string")) {
        throw new TemplateValidationError("a media HEADER needs example.header_handle (a non-empty array of strings)");
      }
    }
  }
  if (type === "BUTTONS") {
    const buttons = c["buttons"];
    if (!Array.isArray(buttons)) throw new TemplateValidationError("BUTTONS needs a buttons array");
    if (buttons.length > MAX_BUTTONS) throw new TemplateValidationError(`at most ${MAX_BUTTONS} buttons are allowed`);
    for (const b of buttons) {
      if (!isObj(b) || (b["text"] !== undefined && typeof b["text"] !== "string")) throw new TemplateValidationError("each button must be an object with string text");
    }
  }
  return type;
}

/** Structural validation only: components are passed to Meta unchanged. */
export function parseTemplateBody(body: unknown): ParsedTemplate {
  if (!isObj(body)) throw new TemplateValidationError("request body must be a JSON object");
  const { name, language, category, components } = body;
  if (typeof name !== "string" || !NAME_RE.test(name)) throw new TemplateValidationError("name must be 1-512 characters of lowercase letters, digits and underscores");
  if (typeof language !== "string" || !LANGUAGE_RE.test(language)) throw new TemplateValidationError("language must be 2-15 letters or underscores, for example en_US");
  const cat = typeof category === "string" ? (category.toLowerCase() as PublicTemplateCategory) : null;
  if (!cat || !CATEGORIES.includes(cat)) throw new TemplateValidationError("category must be MARKETING, UTILITY or AUTHENTICATION");
  if (!Array.isArray(components) || components.length === 0) throw new TemplateValidationError("components must be a non-empty array");
  if (components.length > MAX_COMPONENTS) throw new TemplateValidationError(`at most ${MAX_COMPONENTS} components are allowed`);
  const types = components.map(checkComponent);
  if (!types.includes("BODY")) throw new TemplateValidationError("components must include a BODY");
  const acc = body["allow_category_change"];
  if (acc !== undefined && typeof acc !== "boolean") throw new TemplateValidationError("allow_category_change must be a boolean");
  return { name, language, category: cat, components: components as object[], allowCategoryChange: acc === true };
}

function qp(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

/** Never throws: junk values fall back to defaults, out-of-range values are clamped. */
export function parseListQuery(q: Record<string, unknown> | null | undefined): { name?: string; limit: number; offset: number } {
  const src = q ?? {};
  const l = Number.parseInt(qp(src["limit"]) ?? "", 10);
  const o = Number.parseInt(qp(src["offset"]) ?? "", 10);
  const name = qp(src["template_name"])?.trim();
  return {
    ...(name ? { name } : {}),
    limit: Number.isNaN(l) ? MAX_LIMIT : Math.min(Math.max(l, 1), MAX_LIMIT),
    offset: Number.isNaN(o) ? 0 : Math.min(Math.max(o, 0), MAX_OFFSET),
  };
}

export function templateStatus(s: PublicTemplateStatus): "PENDING" | "APPROVED" | "REJECTED" {
  if (s === "approved") return "APPROVED";
  if (s === "rejected") return "REJECTED";
  return "PENDING"; // draft and pending
}

export interface TemplateRow {
  metaTemplateId: string | null;
  name: string;
  language: string;
  category: PublicTemplateCategory;
  status: PublicTemplateStatus;
  qualityScore: string | null;
  rejectedReason: string | null;
  components: unknown;
}

export function toSubmitResponse(row: Pick<TemplateRow, "metaTemplateId" | "name" | "language" | "category" | "status">) {
  return {
    api_id: newApiId(),
    status: "success",
    message: "template submitted to meta for review",
    template_id: row.metaTemplateId ?? "",
    template_name: row.name,
    template_status: templateStatus(row.status),
    template_language: row.language,
    template_category: row.category.toUpperCase(),
  };
}

export function toListObject(row: Pick<TemplateRow, "metaTemplateId" | "name" | "language" | "category" | "status">) {
  return {
    template_id: row.metaTemplateId ?? "",
    name: row.name,
    language: row.language,
    category: row.category.toUpperCase(),
    status: templateStatus(row.status),
  };
}

export function toRetrieveResponse(row: TemplateRow) {
  return {
    api_id: newApiId(),
    ...toListObject(row),
    quality_score: { score: row.qualityScore ?? "UNKNOWN" },
    rejected_reason: row.rejectedReason ?? "NONE",
    components: row.components,
  };
}
