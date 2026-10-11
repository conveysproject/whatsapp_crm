import type { PrismaClient } from "@prisma/client";
import { isMetaBillable } from "./meta-pricing.js";

export type CountMode = "follow" | "never" | "always";
export const COUNT_MODES: readonly CountMode[] = ["follow", "never", "always"];
/** Rule key used when Meta sends no category. */
export const UNKNOWN_CATEGORY = "unknown";

export type CountRules = Map<string, CountMode>;

/**
 * Whether a message counts. Default (no rule, or "follow"): only when Meta charges (type regular).
 * "never" excludes a whole category; "always" counts it whenever Meta reported pricing at all.
 */
export function shouldCount(rules: CountRules, type: string, category: string | null): boolean {
  const mode = rules.get(category ?? UNKNOWN_CATEGORY) ?? "follow";
  if (mode === "never") return false;
  if (mode === "always") return true;
  return isMetaBillable(type);
}

const TTL_MS = 60_000;
let cache: { at: number; rules: CountRules } | null = null;

export function clearCountRulesCache(): void {
  cache = null;
}

/** Cached for 60 seconds per process; on a read failure the last known rules (or an empty set = follow Meta) are used. */
export async function loadCountRules(prisma: PrismaClient, now: number = Date.now()): Promise<CountRules> {
  if (cache && now - cache.at < TTL_MS) return cache.rules;
  try {
    const rows = await prisma.billingCountRule.findMany({ select: { category: true, mode: true } });
    const rules: CountRules = new Map();
    for (const r of rows) if ((COUNT_MODES as readonly string[]).includes(r.mode)) rules.set(r.category, r.mode as CountMode);
    cache = { at: now, rules };
    return rules;
  } catch {
    return cache?.rules ?? new Map();
  }
}
