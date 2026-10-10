import { describe, it, expect } from "vitest";
import { sortTemplates, type StatsMap } from "./template-list-stats";

const t = (id: string, name: string, updatedAt = "2026-01-01T00:00:00Z") => ({ id, name, updatedAt });
const stat = (templateId: string, sent: number, readRate: number | null) => ({ templateId, sent, delivered: sent, read: 0, deliveryRate: 100, readRate });

describe("sortTemplates", () => {
  const items = [t("a", "Bravo"), t("b", "alpha"), t("c", "Charlie")];
  const stats: StatsMap = { a: stat("a", 10, 50), c: stat("c", 100, null) };

  it("returns input untouched when no key", () => {
    expect(sortTemplates(items, stats, null, "asc")).toBe(items);
  });
  it("sorts names case-insensitively", () => {
    expect(sortTemplates(items, stats, "name", "asc").map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
  it("sinks templates without data to the bottom in both directions", () => {
    expect(sortTemplates(items, stats, "sent", "desc").map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(sortTemplates(items, stats, "sent", "asc").map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("treats a null read rate as no data", () => {
    expect(sortTemplates(items, stats, "readRate", "desc").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("is stable for equal values", () => {
    const eq: StatsMap = { a: stat("a", 5, 1), b: stat("b", 5, 1) };
    expect(sortTemplates(items, eq, "sent", "desc").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
