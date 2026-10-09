/** Pure helpers for backfill-message-template-link.ts (no I/O). */

export interface BackfillRow {
  id: string;
  organizationId: string;
  body: string | null;
  richContent: unknown;
  /** true when an api_message_meta row exists for this message (sent through the public API) */
  hasApiMeta: boolean;
  templateId: string | null;
}

export interface BackfillUpdate {
  id: string;
  organizationId: string;
  templateId: string;
  source: string | null;
}

export interface BackfillPlan {
  updates: BackfillUpdate[];
  ambiguous: number;
  unmatched: number;
  skippedAlreadyLinked: number;
  /** campaign rows (rendered text + rich_content): the template name was never stored, so they cannot be attributed */
  unattributedCampaign: number;
}

export interface BackfillArgs {
  org?: string;
  apply: boolean;
}

/** Meta template names: lowercase letters, digits, underscore. Flow rows store exactly that as body. */
const PLAIN_NAME = /^[a-z0-9_]+$/;

export const templateKey = (organizationId: string, name: string): string => `${organizationId}\u0000${name}`;

type Parsed = { name: string; kind: "json" | "plain" } | null;

function parse(body: string | null, richContent: unknown): Parsed {
  if (body === null) return null;
  const t = body.trim();
  if (t.startsWith("{")) {
    try {
      const v: unknown = JSON.parse(t);
      const n = v && typeof v === "object" ? (v as Record<string, unknown>)["templateName"] : undefined;
      return typeof n === "string" && n.trim() !== "" ? { name: n.trim(), kind: "json" } : null;
    } catch {
      return null;
    }
  }
  // Campaign rows keep the rendered text in body and header/footer/buttons in rich_content: the body is not a name.
  if (richContent !== null && richContent !== undefined) return null;
  return PLAIN_NAME.test(t) ? { name: t, kind: "plain" } : null;
}

/** Template name stored in a message body: `{"templateName": ...}` JSON (dashboard/test/API) or a plain name (flow). */
export function parseTemplateName(body: string | null, richContent?: unknown): string | null {
  return parse(body, richContent)?.name ?? null;
}

/**
 * Decide which rows to link. A name maps to a template only when the row's organization has EXACTLY ONE template with
 * that name (`templatesByOrgAndName`: templateKey(org, name) -> template ids). Never guesses; never touches linked rows.
 */
export function planBackfill(rows: BackfillRow[], templatesByOrgAndName: Map<string, string[]>): BackfillPlan {
  const plan: BackfillPlan = { updates: [], ambiguous: 0, unmatched: 0, skippedAlreadyLinked: 0, unattributedCampaign: 0 };
  for (const r of rows) {
    if (r.templateId !== null) { plan.skippedAlreadyLinked++; continue; }
    const p = parse(r.body, r.richContent);
    if (!p) {
      if (r.richContent !== null && r.richContent !== undefined && !(r.body ?? "").trim().startsWith("{")) plan.unattributedCampaign++;
      else plan.unmatched++;
      continue;
    }
    const ids = templatesByOrgAndName.get(templateKey(r.organizationId, p.name)) ?? [];
    if (ids.length === 0) { plan.unmatched++; continue; }
    if (ids.length > 1) { plan.ambiguous++; continue; }
    // dashboard and test sends both store JSON and cannot be told apart: leave source NULL rather than invent one.
    const source = r.hasApiMeta ? "api" : p.kind === "plain" ? "flow" : null;
    plan.updates.push({ id: r.id, organizationId: r.organizationId, templateId: ids[0]!, source });
  }
  return plan;
}

export function parseArgs(argv: string[]): BackfillArgs {
  let org: string | undefined;
  const i = argv.indexOf("--org");
  if (i >= 0) {
    const v = argv[i + 1]?.trim();
    if (!v || v.startsWith("--")) throw new Error("--org requires a value");
    org = v;
  }
  return { ...(org ? { org } : {}), apply: argv.includes("--apply") };
}
