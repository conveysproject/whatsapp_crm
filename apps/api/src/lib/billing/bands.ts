/**
 * Monthly price bands for the message-volume bill. Pure functions, no I/O.
 * Config is platform-wide and owner-editable (see billing-settings.ts). `published` stays false until the owner
 * confirms the prices: while false, customers are never shown a price, a band range or a bill.
 */
export interface Band {
  /** Inclusive upper limit of this band (messages per month). Bands are ascending; the last band is the cap. */
  upTo: number;
  inr: number;
  usd: number;
}

export interface BillingConfig {
  published: boolean;
  freeAllowance: number;
  bands: Band[];
}

/** Draft from docs/billing-price-bands-draft.md. Not final; never shown to customers while published is false. */
export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  published: false,
  freeAllowance: 500,
  bands: [
    { upTo: 10_000, inr: 999, usd: 12 },
    { upTo: 50_000, inr: 2999, usd: 36 },
    { upTo: 250_000, inr: 7999, usd: 96 },
  ],
};

const MAX = 1_000_000_000;

function isInt(n: unknown, min: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= MAX;
}

/** Returns a normalized config, or an error message. Never trusts shape or types. */
export function parseBillingConfig(raw: unknown): { ok: true; config: BillingConfig } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "config must be an object" };
  const o = raw as Record<string, unknown>;
  if (typeof o["published"] !== "boolean") return { ok: false, error: "published must be true or false" };
  if (!isInt(o["freeAllowance"], 0)) return { ok: false, error: "freeAllowance must be a whole number, 0 or more" };
  const bandsRaw = o["bands"];
  if (!Array.isArray(bandsRaw) || bandsRaw.length < 1 || bandsRaw.length > 12) return { ok: false, error: "bands must be a list of 1 to 12 bands" };
  const bands: Band[] = [];
  let prevUpTo = o["freeAllowance"];
  let prevInr = 0;
  let prevUsd = 0;
  for (const b of bandsRaw) {
    if (!b || typeof b !== "object") return { ok: false, error: "each band must be an object" };
    const r = b as Record<string, unknown>;
    if (!isInt(r["upTo"], 1) || r["upTo"] <= prevUpTo) return { ok: false, error: "each band's upTo must be a whole number above the previous band" };
    if (!isInt(r["inr"], 0) || !isInt(r["usd"], 0)) return { ok: false, error: "inr and usd must be whole numbers, 0 or more" };
    if (r["inr"] < prevInr || r["usd"] < prevUsd) return { ok: false, error: "prices must not go down from one band to the next" };
    bands.push({ upTo: r["upTo"], inr: r["inr"], usd: r["usd"] });
    prevUpTo = r["upTo"];
    prevInr = r["inr"];
    prevUsd = r["usd"];
  }
  return { ok: true, config: { published: o["published"], freeAllowance: o["freeAllowance"], bands } };
}

export interface BandView {
  name: string;
  from: number;
  /** null for "above the cap" (custom quote). */
  to: number | null;
  inr: number | null;
  usd: number | null;
}

export type Position = "free" | "band" | "above";

export interface PlanView {
  published: true;
  freeAllowance: number;
  bands: BandView[];
  position: Position;
  current: BandView;
  /** Messages left before the next band starts, or null when already in the top (or above) band. */
  remainingToNextBand: number | null;
  next: BandView | null;
  cap: { upTo: number; inr: number; usd: number };
}

export interface HiddenPlanView {
  published: false;
  freeAllowance: number;
}

/** Band table: Free, Band 1..n, then "Above" (custom quote). */
export function bandViews(config: BillingConfig): BandView[] {
  const views: BandView[] = [{ name: "Free", from: 0, to: config.freeAllowance, inr: 0, usd: 0 }];
  let from = config.freeAllowance + 1;
  config.bands.forEach((b, i) => {
    const last = i === config.bands.length - 1;
    views.push({ name: last && config.bands.length > 1 ? `Band ${i + 1} (cap)` : `Band ${i + 1}`, from, to: b.upTo, inr: b.inr, usd: b.usd });
    from = b.upTo + 1;
  });
  views.push({ name: "Above", from, to: null, inr: null, usd: null });
  return views;
}

function viewIndexFor(count: number, config: BillingConfig): number {
  if (count <= config.freeAllowance) return 0;
  const i = config.bands.findIndex((b) => count <= b.upTo);
  return i === -1 ? config.bands.length + 1 : i + 1;
}

/** The customer-facing plan for a message count. Unpublished config reveals nothing but the free allowance. */
export function planFor(count: number, config: BillingConfig): PlanView | HiddenPlanView {
  if (!config.published) return { published: false, freeAllowance: config.freeAllowance };
  const views = bandViews(config);
  const idx = viewIndexFor(Math.max(0, Math.floor(count)), config);
  const current = views[idx]!;
  const next = idx < views.length - 1 && views[idx + 1]!.to !== null ? views[idx + 1]! : null;
  const last = config.bands[config.bands.length - 1]!;
  return {
    published: true,
    freeAllowance: config.freeAllowance,
    bands: views,
    position: idx === 0 ? "free" : idx === views.length - 1 ? "above" : "band",
    current,
    remainingToNextBand: next && current.to !== null ? current.to + 1 - Math.floor(count) : null,
    next,
    cap: { upTo: last.upTo, inr: last.inr, usd: last.usd },
  };
}

/** Straight-line projection of the month's total from the pace so far (UTC days). Null when too early to say. */
export function projectMonthTotal(countSoFar: number, daysElapsed: number, daysInMonth: number): number | null {
  if (daysElapsed < 3 || daysInMonth <= 0) return null;
  return Math.round((countSoFar / daysElapsed) * daysInMonth);
}
