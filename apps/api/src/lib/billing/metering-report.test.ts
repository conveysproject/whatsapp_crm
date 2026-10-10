import { describe, it, expect } from "vitest";
import { formatDryRunLine, formatApplyLine } from "./metering-report.js";

describe("metering report", () => {
  it("shows no stored rows as none with delta equal to the recomputed total", () => {
    expect(formatDryRunLine("2026-10-09", 2, 3, null)).toBe("DRY RUN: 2026-10-09 orgs=2 billable=3 stored=none delta=+3");
  });
  it("shows a positive delta against a stored total", () => {
    expect(formatDryRunLine("2026-10-09", 2, 5, 3)).toBe("DRY RUN: 2026-10-09 orgs=2 billable=5 stored=3 delta=+2");
  });
  it("shows a negative delta and zero without sign", () => {
    expect(formatDryRunLine("2026-10-09", 1, 1, 4)).toBe("DRY RUN: 2026-10-09 orgs=1 billable=1 stored=4 delta=-3");
    expect(formatDryRunLine("2026-10-09", 1, 4, 4)).toBe("DRY RUN: 2026-10-09 orgs=1 billable=4 stored=4 delta=0");
  });
  it("shows n/a when the stored table is unavailable", () => {
    expect(formatDryRunLine("2026-10-09", 1, 4, "n/a")).toBe("DRY RUN: 2026-10-09 orgs=1 billable=4 stored=n/a delta=n/a");
    expect(formatApplyLine("2026-10-09", 1, 2, "n/a")).toBe("APPLY: 2026-10-09 upserted=1 removed=2 was=n/a");
  });
  it("formats the apply line with none and a number", () => {
    expect(formatApplyLine("2026-10-09", 1, 0, null)).toBe("APPLY: 2026-10-09 upserted=1 removed=0 was=none");
    expect(formatApplyLine("2026-10-09", 1, 0, 7)).toBe("APPLY: 2026-10-09 upserted=1 removed=0 was=7");
  });
});
