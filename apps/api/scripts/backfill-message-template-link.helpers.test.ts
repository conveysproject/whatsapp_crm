import { describe, it, expect } from "vitest";
import { parseTemplateName, planBackfill, parseArgs, templateKey, type BackfillRow } from "./backfill-message-template-link.helpers.js";

describe("parseTemplateName", () => {
  it("reads templateName from a JSON body", () => {
    expect(parseTemplateName(JSON.stringify({ templateName: "welcome", body: "hi" }))).toBe("welcome");
  });
  it("reads a plain name (flow rows)", () => {
    expect(parseTemplateName("order_update")).toBe("order_update");
  });
  it("returns null for invalid JSON, JSON without templateName, free text and empty", () => {
    expect(parseTemplateName("{not json")).toBeNull();
    expect(parseTemplateName('{"a":1}')).toBeNull();
    expect(parseTemplateName('{"templateName":""}')).toBeNull();
    expect(parseTemplateName("Hello Anna, your order is ready")).toBeNull();
    expect(parseTemplateName("")).toBeNull();
    expect(parseTemplateName(null)).toBeNull();
  });
  it("campaign rows (rendered text + rich_content) never yield a name, even a one-word body", () => {
    expect(parseTemplateName("Hello", { header: undefined, footer: "f", buttons: [] })).toBeNull();
    expect(parseTemplateName("hello", { buttons: [] })).toBeNull();
  });
  it("a JSON body still wins when rich_content is present", () => {
    expect(parseTemplateName('{"templateName":"x"}', { a: 1 })).toBe("x");
  });
});

const row = (o: Partial<BackfillRow> & { id: string }): BackfillRow => ({
  organizationId: "A", body: null, richContent: null, hasApiMeta: false, templateId: null, ...o,
});
const json = (n: string) => JSON.stringify({ templateName: n });

describe("planBackfill", () => {
  const tpls = new Map<string, string[]>([
    [templateKey("A", "one"), ["t1"]],
    [templateKey("A", "multi"), ["t2en", "t2hi"]],
    [templateKey("A", "flowy"), ["t3"]],
    [templateKey("B", "one"), ["tB1"]],
  ]);

  it("links a unique name and leaves source NULL for dashboard/test JSON rows", () => {
    const r = planBackfill([row({ id: "m1", body: json("one") })], tpls);
    expect(r.updates).toEqual([{ id: "m1", organizationId: "A", templateId: "t1", source: null }]);
  });
  it("api_message_meta rows get source api", () => {
    const r = planBackfill([row({ id: "m1", body: json("one"), hasApiMeta: true })], tpls);
    expect(r.updates[0]).toMatchObject({ templateId: "t1", source: "api" });
  });
  it("plain-name body gets source flow", () => {
    const r = planBackfill([row({ id: "m1", body: "flowy" })], tpls);
    expect(r.updates[0]).toMatchObject({ templateId: "t3", source: "flow" });
  });
  it("multi-language names are ambiguous: counted, not updated", () => {
    const r = planBackfill([row({ id: "m1", body: json("multi") })], tpls);
    expect(r).toMatchObject({ updates: [], ambiguous: 1, unmatched: 0 });
  });
  it("unknown names and unparseable bodies are unmatched", () => {
    const r = planBackfill([row({ id: "m1", body: json("nope") }), row({ id: "m2", body: "free text here" })], tpls);
    expect(r).toMatchObject({ updates: [], unmatched: 2 });
  });
  it("rows already linked are skipped and never updated", () => {
    const r = planBackfill([row({ id: "m1", body: json("one"), templateId: "x" })], tpls);
    expect(r).toMatchObject({ updates: [], skippedAlreadyLinked: 1, unmatched: 0 });
  });
  it("a name only resolves inside the row's own organization", () => {
    const r = planBackfill([row({ id: "m1", organizationId: "B", body: json("one") }), row({ id: "m2", organizationId: "B", body: json("flowy") })], tpls);
    expect(r.updates).toEqual([{ id: "m1", organizationId: "B", templateId: "tB1", source: null }]);
    expect(r.unmatched).toBe(1);
  });
  it("campaign rows (rich_content, non-JSON body) are counted as unattributed campaign candidates, not unmatched", () => {
    const r = planBackfill([row({ id: "m1", body: "Hello Anna", richContent: { buttons: [] } })], tpls);
    expect(r).toMatchObject({ updates: [], unmatched: 0, unattributedCampaign: 1 });
  });
});

describe("parseArgs", () => {
  it("defaults to dry run without org", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });
  it("reads --org and --apply", () => {
    expect(parseArgs(["--org", "o1", "--apply"])).toEqual({ org: "o1", apply: true });
  });
  it("throws when --org has no value", () => {
    expect(() => parseArgs(["--org"])).toThrow(/--org requires a value/);
    expect(() => parseArgs(["--org", "--apply"])).toThrow(/--org requires a value/);
  });
  it("ignores unknown flags", () => {
    expect(parseArgs(["--wat", "--org", "o1"])).toEqual({ org: "o1", apply: false });
  });
});
