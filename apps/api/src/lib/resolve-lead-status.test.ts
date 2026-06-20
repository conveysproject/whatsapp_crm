import { describe, it, expect } from "vitest";
import { resolveLeadStatusId } from "./resolve-lead-status.js";

const nameToId = new Map([["new lead", "ls-new"], ["closed won", "ls-won"]]);
const validIds = new Set(["ls-new", "ls-won", "ls-default"]);

describe("resolveLeadStatusId", () => {
  it("matches CSV text by case-insensitive name", () => {
    expect(resolveLeadStatusId("New Lead", nameToId, validIds, null)).toBe("ls-new");
    expect(resolveLeadStatusId("  closed WON ", nameToId, validIds, null)).toBe("ls-won");
  });
  it("accepts a CSV value that is already a valid id", () => {
    expect(resolveLeadStatusId("ls-won", nameToId, validIds, null)).toBe("ls-won");
  });
  it("falls back to the batch default when CSV text is unmatched", () => {
    expect(resolveLeadStatusId("Nonsense", nameToId, validIds, "ls-default")).toBe("ls-default");
  });
  it("falls back to the batch default when CSV text is empty", () => {
    expect(resolveLeadStatusId("", nameToId, validIds, "ls-default")).toBe("ls-default");
    expect(resolveLeadStatusId(null, nameToId, validIds, "ls-default")).toBe("ls-default");
  });
  it("returns null when nothing matches and no valid default", () => {
    expect(resolveLeadStatusId("Nonsense", nameToId, validIds, null)).toBeNull();
    expect(resolveLeadStatusId("x", nameToId, validIds, "not-a-real-id")).toBeNull();
  });
});
