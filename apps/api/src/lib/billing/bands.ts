import { GSTIN_RE } from "./billing-details.js";
import { LEGAL_SELLER_NAME } from "./legal-seller.js";

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
  /** Owner switch: email billing admins when a usage threshold is reached. Off until the owner turns it on. */
  alertsEnabled: boolean;
  /** First billing-cycle start date (YYYY-MM-DD) that may be charged. null = nothing is ever issued. Cycles that started earlier are never billed. */
  chargingStartDate: string | null;
  /** GST percentage added to INR statements (0 = no tax line). USD statements are never taxed. Owner decision; default 0. */
  gstRatePercent: number;
  /** Who is shown as the seller on statements and PDFs. Empty fields are left off the document. */
  seller: { legalName: string; address: string; gstin: string };
  /** Issue statements automatically when a billing month ends (daily job). Off until the owner turns it on. */
  autoIssueEnabled: boolean;
  /** off = no warnings or blocking; watch = warn and record who WOULD be blocked, block nothing; enforce = refuse sends 7 days after the due date. */
  blockingMode: "off" | "watch" | "enforce";
}

/** Draft from docs/billing-price-bands-draft.md. Not final; never shown to customers while published is false. */
export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  published: false,
  freeAllowance: 500,
  alertsEnabled: false,
  chargingStartDate: null,
  gstRatePercent: 0,
  seller: { legalName: LEGAL_SELLER_NAME, address: "", gstin: "" },
  autoIssueEnabled: false,
  blockingMode: "watch",
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
  if (o["alertsEnabled"] !== undefined && typeof o["alertsEnabled"] !== "boolean") return { ok: false, error: "alertsEnabled must be true or false" };
  const csd = o["chargingStartDate"];
  if (csd !== undefined && csd !== null && (typeof csd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(csd) || Number.isNaN(Date.parse(`${csd}T00:00:00Z`)) || new Date(`${csd}T00:00:00Z`).toISOString().slice(0, 10) !== csd)) {
    return { ok: false, error: "chargingStartDate must be a real date in YYYY-MM-DD format, or empty" };
  }
  const gst = o["gstRatePercent"];
  if (gst !== undefined && (typeof gst !== "number" || !Number.isInteger(gst) || gst < 0 || gst > 40)) return { ok: false, error: "gstRatePercent must be a whole number from 0 to 40" };
  let seller = DEFAULT_BILLING_CONFIG.seller;
  if (o["seller"] !== undefined) {
    const sr = o["seller"];
    if (!sr || typeof sr !== "object" || Array.isArray(sr)) return { ok: false, error: "seller must be an object" };
    const so = sr as Record<string, unknown>;
    const t = (k: string): string | null => (so[k] === undefined ? "" : typeof so[k] === "string" ? (so[k] as string).trim() : null);
    const legalName = t("legalName");
    const address = t("address");
    const gstin = t("gstin");
    if (legalName === null || address === null || gstin === null) return { ok: false, error: "seller fields must be text" };
    if (legalName.length > 120 || address.length > 300) return { ok: false, error: "seller text is too long" };
    if (gstin !== "" && !GSTIN_RE.test(gstin.toUpperCase())) return { ok: false, error: "seller gstin must be a valid 15-character GST number" };
    seller = { legalName, address, gstin: gstin.toUpperCase() };
  }
  if (o["autoIssueEnabled"] !== undefined && typeof o["autoIssueEnabled"] !== "boolean") return { ok: false, error: "autoIssueEnabled must be true or false" };
  const bm = o["blockingMode"];
  if (bm !== undefined && bm !== "off" && bm !== "watch" && bm !== "enforce") return { ok: false, error: "blockingMode must be off, watch or enforce" };
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
  return { ok: true, config: { published: o["published"], freeAllowance: o["freeAllowance"], alertsEnabled: o["alertsEnabled"] === true, chargingStartDate: typeof csd === "string" ? csd : null, gstRatePercent: typeof gst === "number" ? gst : 0, seller, autoIssueEnabled: o["autoIssueEnabled"] === true, blockingMode: bm === "off" || bm === "enforce" ? bm : "watch", bands } };
}

export interface BandView {
  name: string;
  from: number;
  /** null for the top band: it has no upper limit, the price is capped. */
  to: number | null;
  inr: number | null;
  usd: number | null;
}

export type Position = "free" | "band";

export interface PlanView {
  published: true;
  freeAllowance: number;
  bands: BandView[];
  position: Position;
  current: BandView;
  /** Messages left before the next band starts, or null when already in the top band. */
  remainingToNextBand: number | null;
  next: BandView | null;
  cap: { upTo: number; inr: number; usd: number };
}

export interface HiddenPlanView {
  published: false;
  freeAllowance: number;
}

/** Band table: Free, Band 1..n. The top band has no upper limit: above its starting count the price stays at the cap. */
export function bandViews(config: BillingConfig): BandView[] {
  const views: BandView[] = [{ name: "Free", from: 0, to: config.freeAllowance, inr: 0, usd: 0 }];
  let from = config.freeAllowance + 1;
  config.bands.forEach((b, i) => {
    const last = i === config.bands.length - 1;
    views.push({ name: last && config.bands.length > 1 ? `Band ${i + 1} (cap)` : `Band ${i + 1}`, from, to: last ? null : b.upTo, inr: b.inr, usd: b.usd });
    from = b.upTo + 1;
  });
  return views;
}

function viewIndexFor(count: number, config: BillingConfig): number {
  if (count <= config.freeAllowance) return 0;
  const i = config.bands.findIndex((b) => count <= b.upTo);
  // Above the last band's limit the price stays at the cap (the last band).
  return i === -1 ? config.bands.length : i + 1;
}

/** The customer-facing plan for a message count. Unpublished config reveals nothing but the free allowance. */
export function planFor(count: number, config: BillingConfig): PlanView | HiddenPlanView {
  if (!config.published) return { published: false, freeAllowance: config.freeAllowance };
  const views = bandViews(config);
  const idx = viewIndexFor(Math.max(0, Math.floor(count)), config);
  const current = views[idx]!;
  const next = idx < views.length - 1 ? views[idx + 1]! : null;
  const last = config.bands[config.bands.length - 1]!;
  return {
    published: true,
    freeAllowance: config.freeAllowance,
    bands: views,
    position: idx === 0 ? "free" : "band",
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
