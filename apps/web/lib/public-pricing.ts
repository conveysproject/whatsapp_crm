/**
 * Data layer for the public price list (GET /v1/public/pricing, see apps/api/src/routes/public-pricing.ts).
 * Prices are whatever the owner published in Admin > Billing. Normalisation never throws.
 */
import { API_BASE, formatCount, formatInr, formatUsd, type BandView } from "./message-usage";

export type PublicPricing =
  | { published: false; freeAllowance: number }
  | { published: true; freeAllowance: number; bands: BandView[] };

export type Currency = "inr" | "usd";

export interface PricingCard { key: string; range: string; price: string; note: string; isCap: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function normalizeBand(raw: unknown): BandView | null {
  if (!isRecord(raw) || typeof raw["name"] !== "string") return null;
  const from = count(raw["from"]);
  if (from === null) return null;
  return { name: raw["name"], from, to: count(raw["to"]), inr: count(raw["inr"]), usd: count(raw["usd"]) };
}

export function normalizePublicPricing(raw: unknown): PublicPricing | null {
  if (!isRecord(raw) || typeof raw["published"] !== "boolean") return null;
  const freeAllowance = count(raw["freeAllowance"]) ?? 0;
  if (!raw["published"]) return { published: false, freeAllowance };
  const bands = Array.isArray(raw["bands"]) ? raw["bands"].map(normalizeBand).filter((b): b is BandView => b !== null) : [];
  if (bands.length === 0) return { published: false, freeAllowance };
  return { published: true, freeAllowance, bands };
}

/** Server-side fetch for the landing page; refreshed every 5 minutes. Null when the API is unreachable. */
export async function fetchPublicPricing(): Promise<PublicPricing | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/public/pricing`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return normalizePublicPricing(isRecord(json) ? json["data"] : undefined);
  } catch {
    return null;
  }
}

function rangeLabel(b: BandView): string {
  if (b.to === null) return `${formatCount(b.from)} messages and above`;
  if (b.from === 0) return `Up to ${formatCount(b.to)} messages`;
  return `${formatCount(b.from)} to ${formatCount(b.to)} messages`;
}

export function pricingCards(p: PublicPricing, currency: Currency): PricingCard[] {
  if (!p.published) return [];
  return p.bands.map((b) => {
    const isCap = b.to === null && p.bands.length > 1;
    return {
      key: b.name,
      range: rangeLabel(b),
      price: currency === "inr" ? formatInr(b.inr) : formatUsd(b.usd),
      note: b.from === 0 ? "every month" : isCap ? "max per month, never more" : "per month",
      isCap,
    };
  });
}

export function freeAllowanceLabel(n: number): string {
  return `${formatCount(n)} messages free every month`;
}
