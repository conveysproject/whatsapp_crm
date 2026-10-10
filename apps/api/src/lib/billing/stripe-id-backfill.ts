/**
 * Pure planning logic for backfilling Organization.stripeId from settings.stripeCustomerId.
 * No I/O here; the CLI is apps/api/scripts/backfill-stripe-id.ts.
 */

export interface BackfillOrg {
  id: string;
  stripeId: string | null;
  settings: unknown;
}

export interface BackfillPlan {
  updates: { id: string; stripeId: string }[];
  conflicts: { stripeId: string; orgIds: string[] }[];
}

function customerIdFromSettings(settings: unknown): string | null {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return null;
  const v = (settings as Record<string, unknown>)["stripeCustomerId"];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Only orgs with stripeId === null and a non-empty string settings.stripeCustomerId are candidates.
 * A customer id claimed by more than one org (two candidates, or a candidate plus an org that already
 * holds it in stripeId) is a conflict: nobody is updated and it is reported. Orgs are passed in full
 * (including those with stripeId set) so existing holders are visible.
 */
export function planStripeIdBackfill(orgs: BackfillOrg[]): BackfillPlan {
  const holders = new Map<string, string[]>();
  const hasCandidate = new Set<string>();
  const candidates: { id: string; stripeId: string }[] = [];
  const add = (stripeId: string, id: string) => {
    const list = holders.get(stripeId);
    if (list) list.push(id);
    else holders.set(stripeId, [id]);
  };
  for (const o of orgs) {
    if (o.stripeId !== null) {
      add(o.stripeId, o.id);
      continue;
    }
    const cid = customerIdFromSettings(o.settings);
    if (!cid) continue;
    add(cid, o.id);
    hasCandidate.add(cid);
    candidates.push({ id: o.id, stripeId: cid });
  }
  const conflicts: BackfillPlan["conflicts"] = [];
  for (const [stripeId, orgIds] of holders) {
    if (orgIds.length > 1 && hasCandidate.has(stripeId)) conflicts.push({ stripeId, orgIds });
  }
  const conflicted = new Set(conflicts.map((c) => c.stripeId));
  return { updates: candidates.filter((c) => !conflicted.has(c.stripeId)), conflicts };
}

/** Strict: only no args (dry run) or exactly `--apply`. Anything else is a usage error. */
export function parseBackfillArgs(argv: string[]): { apply: boolean } {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: backfill-stripe-id.ts [--apply]   (no flag = dry run)");
}
