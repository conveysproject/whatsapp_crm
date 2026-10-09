import { SendValidationError, type PlivoTemplateComponent } from "./send-mapping.js";

export interface TemplateRow {
  name: string;
  language: string;
  status: string;
  components: unknown;
  parameterFormat: string | null;
}

type StoredComp = { type?: string; format?: string; text?: string };
type Params = NonNullable<PlivoTemplateComponent["parameters"]>;

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Unique placeholder keys ("1" or "username") in order of first appearance. */
export function placeholders(text: string | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(PLACEHOLDER)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Picks the one approved template for name+language from every row of that name in the org; specific 400 messages otherwise. */
export function resolveTemplate(rows: TemplateRow[], name: string, language: string): TemplateRow {
  if (rows.length === 0) throw new SendValidationError(`Template "${name}" not found`, "TEMPLATE_NOT_FOUND");
  const sameLang = rows.filter((r) => r.language === language);
  if (sameLang.length === 0) {
    const langs = [...new Set(rows.map((r) => r.language))].sort().join(", ");
    throw new SendValidationError(`Template "${name}" has no language "${language}"; available: ${langs}`, "TEMPLATE_NOT_FOUND");
  }
  const approved = sameLang.filter((r) => r.status === "approved");
  if (approved.length === 0) throw new SendValidationError(`Template "${name}" (${language}) is not approved (status: ${sameLang[0]!.status})`, "TEMPLATE_NOT_APPROVED");
  if (approved.length > 1) throw new SendValidationError("Template name and language match more than one template", "VALIDATION_FAILED");
  return approved[0]!;
}

const notMatched = (part: string, detail: string): never => {
  throw new SendValidationError(`template parameters not matched for ${part}: ${detail}`, "TEMPLATE_PARAMS_MISMATCH");
};

function checkTextPart(part: "BODY" | "HEADER", text: string | undefined, named: boolean, sent: Params): void {
  const expected = placeholders(text);
  if (sent.some((p) => p.type !== "text")) notMatched(part, "only text parameters are allowed here");
  if (named) {
    const got = sent.map((p) => p.parameter_name ?? "");
    const ok = got.length === expected.length && got.every((n) => n !== "") && new Set(got).size === got.length && expected.every((n) => got.includes(n));
    if (!ok) notMatched(part, `expected [${expected.join(", ")}]; got [${got.map((n) => n || "(no parameter_name)").join(", ")}]`);
    return;
  }
  if (sent.some((p) => p.parameter_name !== undefined)) notMatched(part, "this template uses positional parameters, remove parameter_name");
  if (sent.length !== expected.length) notMatched(part, `expected ${expected.length} text parameter(s); got ${sent.length}`);
}

/** Compares BODY and HEADER parameters with the stored template. Button parameters are not checked here. */
export function validateAgainstTemplate(row: TemplateRow, components: PlivoTemplateComponent[]): void {
  const stored = (Array.isArray(row.components) ? row.components : []) as StoredComp[];
  const find = (t: string) => stored.find((c) => c.type?.toUpperCase() === t);
  const sentOf = (t: string): Params => components.filter((c) => c.type.toLowerCase() === t).flatMap((c) => c.parameters ?? []);
  const isNamed = (text?: string) => row.parameterFormat?.toUpperCase() === "NAMED" || placeholders(text).some((p) => !/^\d+$/.test(p));

  const body = find("BODY");
  checkTextPart("BODY", body?.text, isNamed(body?.text), sentOf("body"));

  const header = find("HEADER");
  const sentHeader = sentOf("header");
  const format = header?.format?.toUpperCase();
  if (!header) {
    if (sentHeader.length > 0) notMatched("HEADER", "template has no header");
  } else if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
    if (sentHeader.length !== 1 || sentHeader[0]!.type !== "media") notMatched("HEADER", `expected exactly one media parameter for a ${format} header`);
  } else if (format === "TEXT" || format === undefined) {
    checkTextPart("HEADER", header.text, isNamed(header.text), sentHeader);
  }
}
