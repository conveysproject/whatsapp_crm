import type { AnalyticsRange } from "./template-analytics";

export interface TemplateListStat {
  templateId: string;
  sent: number;
  delivered: number;
  read: number;
  deliveryRate: number | null;
  readRate: number | null;
}

export type StatsMap = Record<string, TemplateListStat>;

export async function fetchTemplateListStats(range: AnalyticsRange): Promise<StatsMap> {
  const res = await fetch(`/api/v1/templates/stats?range=${range}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body: unknown = await res.json();
  const rows = (body as { data?: unknown }).data;
  const map: StatsMap = {};
  if (!Array.isArray(rows)) return map;
  for (const r of rows as TemplateListStat[]) {
    if (r && typeof r.templateId === "string") map[r.templateId] = r;
  }
  return map;
}

export type SortKey = "name" | "sent" | "readRate" | "updatedAt";
export type SortDir = "asc" | "desc";

/** Stable sort. Templates with no data for a numeric key always sink to the bottom, whichever the direction. */
export function sortTemplates<T extends { id: string; name: string; updatedAt: string }>(
  items: T[],
  stats: StatsMap,
  key: SortKey | null,
  dir: SortDir,
): T[] {
  if (!key) return items;
  const sign = dir === "asc" ? 1 : -1;
  const value = (t: T): number | string | null => {
    if (key === "name") return t.name.toLowerCase();
    if (key === "updatedAt") return Date.parse(t.updatedAt) || 0;
    const s = stats[t.id];
    if (!s) return null;
    return key === "sent" ? (s.sent > 0 ? s.sent : null) : s.readRate;
  };
  return items
    .map((t, i) => ({ t, i, v: value(t) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.t);
}
