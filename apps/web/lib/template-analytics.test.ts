import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnalyticsError,
  csvCell,
  csvFileName,
  dateSpanLabel,
  dropOffPercent,
  fetchTemplateAnalytics,
  formatRate,
  isEmptyAnalytics,
  messageForAnalyticsError,
  normalizeAnalytics,
  parseRange,
  sourceLabel,
  toCsv,
  type TemplateAnalytics,
} from "./template-analytics";

const body = (over: Record<string, unknown> = {}) => ({
  data: {
    inProgress: 2, sent: 10, delivered: 8, read: 5, failed: 1, readPercentage: 50,
    rates: { delivery: 80, read: 50, failure: 10 },
    reach: { uniqueRecipients: 7, lastSentAt: "2026-10-10T08:00:00.000Z" },
    daily: [
      { day: "2026-10-09", sent: 4, delivered: 3, read: 2, failed: 0 },
      { day: "2026-10-10", sent: 6, delivered: 5, read: 3, failed: 1 },
    ],
    failures: [{ code: "131026", title: "Undeliverable", message: "Recipient cannot receive", count: 1, share: 100, lastSeenAt: "2026-10-10T07:00:00.000Z" }],
    sources: [{ source: "api", count: 6 }, { source: "campaign", count: 4 }],
    template: { name: "Welcome", language: "en", category: "UTILITY", status: "approved", qualityScore: "GREEN", lastEditedAt: "2026-10-01T00:00:00.000Z", previewText: "Hi {{1}}" },
    range: "30d", attributionNote: null,
    ...over,
  },
});

const sample = (): TemplateAnalytics => normalizeAnalytics(body());

describe("normalizeAnalytics", () => {
  it("normalizes a valid body", () => {
    const a = sample();
    expect(a.sent).toBe(10);
    expect(a.inProgress).toBe(2);
    expect(a.rates).toEqual({ delivery: 80, read: 50, failure: 10 });
    expect(a.reach).toEqual({ uniqueRecipients: 7, lastSentAt: "2026-10-10T08:00:00.000Z" });
    expect(a.daily).toHaveLength(2);
    expect(a.failures[0]).toMatchObject({ code: "131026", message: "Recipient cannot receive", count: 1, share: 100 });
    expect(a.sources).toEqual([{ source: "api", count: 6 }, { source: "campaign", count: 4 }]);
    expect(a.template.name).toBe("Welcome");
    expect(a.range).toBe("30d");
    expect(a.attributionNote).toBeNull();
  });

  it("keeps null rates, null lastSentAt and a present attributionNote", () => {
    const a = normalizeAnalytics(body({ rates: { delivery: null, read: null, failure: null }, reach: { uniqueRecipients: 0, lastSentAt: null }, attributionNote: "Older sends" }));
    expect(a.rates).toEqual({ delivery: null, read: null, failure: null });
    expect(a.reach.lastSentAt).toBeNull();
    expect(a.attributionNote).toBe("Older sends");
  });

  it.each([[null], [undefined], ["x"], [42], [[]], [{}], [{ data: null }], [{ data: "x" }], [{ data: [] }]])("rejects %j with an AnalyticsError", (raw) => {
    expect(() => normalizeAnalytics(raw)).toThrow(AnalyticsError);
    expect(() => normalizeAnalytics(raw)).toThrow(/unexpected format/);
  });

  it("coerces wrong-typed numbers to 0 and non-finite rates to null", () => {
    const a = normalizeAnalytics(body({ sent: "5", delivered: NaN, read: null, failed: undefined, inProgress: -3, rates: { delivery: "80", read: NaN, failure: Infinity } }));
    expect(a.sent).toBe(0);
    expect(a.delivered).toBe(0);
    expect(a.read).toBe(0);
    expect(a.failed).toBe(0);
    expect(a.inProgress).toBe(0);
    expect(a.rates).toEqual({ delivery: null, read: null, failure: null });
  });

  it("is defensive about daily, failures and sources", () => {
    const a = normalizeAnalytics(body({
      daily: [null, "x", { day: "2026-10-10", sent: "a" }, { sent: 3 }],
      failures: [1, { code: 131026, message: 5, count: 2 }, { code: null, title: null, message: "m", count: 1, share: 5, lastSeenAt: null }],
      sources: [{ source: "weird", count: 3 }, { count: 2 }, "x"],
      template: null,
      attributionNote: 5,
    }));
    expect(a.daily).toEqual([{ day: "2026-10-10", sent: 0, delivered: 0, read: 0, failed: 0 }]);
    expect(a.failures).toHaveLength(2);
    expect(a.failures[0]).toMatchObject({ code: "131026", message: "", count: 2 });
    expect(a.failures[1]).toMatchObject({ code: null, message: "m", lastSeenAt: null });
    expect(a.sources).toEqual([{ source: "unknown", count: 3 }, { source: "unknown", count: 2 }]);
    expect(a.template.name).toBe("");
    expect(a.attributionNote).toBeNull();
  });

  it("treats non-array collections as empty", () => {
    const a = normalizeAnalytics(body({ daily: "x", failures: {}, sources: null }));
    expect(a.daily).toEqual([]);
    expect(a.failures).toEqual([]);
    expect(a.sources).toEqual([]);
  });
});

describe("fetchTemplateAnalytics", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (res: Response | Error) => {
    const f = vi.fn(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)));
    vi.stubGlobal("fetch", f);
    return f;
  };
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

  it("requests the encoded id and range and normalizes", async () => {
    const f = stub(json(200, body()));
    const a = await fetchTemplateAnalytics("a/b", "7d");
    expect(f).toHaveBeenCalledWith("/api/v1/templates/a%2Fb/analytics?range=7d");
    expect(a.sent).toBe(10);
  });

  it.each([
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [400, "INVALID_RANGE"],
    [500, "INTERNAL"],
  ])("maps %i to %s", async (status, code) => {
    stub(json(status, { error: { code, message: "boom" } }));
    await expect(fetchTemplateAnalytics("t1", "30d")).rejects.toMatchObject({ code, status });
  });

  it("falls back to UNKNOWN when the error body is not JSON", async () => {
    stub(new Response("<html>", { status: 502 }));
    await expect(fetchTemplateAnalytics("t1", "30d")).rejects.toMatchObject({ code: "UNKNOWN", status: 502 });
  });

  it("maps a network failure to NETWORK", async () => {
    stub(new TypeError("fail"));
    await expect(fetchTemplateAnalytics("t1", "30d")).rejects.toMatchObject({ code: "NETWORK", status: 0 });
  });

  it("rejects a 200 with a malformed body", async () => {
    stub(json(200, { nope: true }));
    await expect(fetchTemplateAnalytics("t1", "30d")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("messageForAnalyticsError", () => {
  it("returns friendly texts", () => {
    expect(messageForAnalyticsError(new AnalyticsError("FORBIDDEN", "x", 403))).toBe("You do not have access to template analytics");
    expect(messageForAnalyticsError(new AnalyticsError("NOT_FOUND", "x", 404))).toBe("Template not found");
    expect(messageForAnalyticsError(new AnalyticsError("NETWORK", "Network down", 0))).toBe("Network down");
    expect(messageForAnalyticsError(new Error("secret stack"))).toBe("Something went wrong. Please try again.");
  });
});

describe("helpers", () => {
  it("formatRate", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(80)).toBe("80%");
    expect(formatRate(33.3)).toBe("33.3%");
  });

  it("parseRange defaults to 30d", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("1y")).toBe("30d");
    expect(parseRange(null)).toBe("30d");
  });

  it("dropOffPercent guards divide by zero", () => {
    expect(dropOffPercent(10, 8)).toBe(20);
    expect(dropOffPercent(0, 0)).toBeNull();
    expect(dropOffPercent(3, 5)).toBe(0);
  });

  it("sourceLabel", () => {
    expect(sourceLabel("api")).toBe("API");
    expect(sourceLabel("dashboard")).toBe("Dashboard");
    expect(sourceLabel("campaign")).toBe("Campaign");
    expect(sourceLabel("flow")).toBe("Flow");
    expect(sourceLabel("test")).toBe("Test send");
    expect(sourceLabel("unknown")).toBe("Unknown / older");
  });

  it("isEmptyAnalytics", () => {
    expect(isEmptyAnalytics(normalizeAnalytics(body({ sent: 0, failed: 0, inProgress: 0 })))).toBe(true);
    expect(isEmptyAnalytics(normalizeAnalytics(body({ sent: 0, failed: 1, inProgress: 0 })))).toBe(false);
    expect(isEmptyAnalytics(normalizeAnalytics(body({ sent: 0, failed: 0, inProgress: 1 })))).toBe(false);
  });

  it("dateSpanLabel", () => {
    expect(dateSpanLabel(sample().daily, "7d")).toBe("9 Oct to 10 Oct (UTC days)");
    expect(dateSpanLabel([{ day: "2026-10-08", sent: 0, delivered: 0, read: 0, failed: 0 }], "7d")).toBe("8 Oct (UTC day)");
    expect(dateSpanLabel(sample().daily, "all")).toBe("All time");
    expect(dateSpanLabel([], "30d")).toBe("");
  });
});

describe("csv", () => {
  it("csvCell escapes quotes, commas, newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("l1\nl2")).toBe('"l1\nl2"');
    expect(csvCell(5)).toBe("5");
    expect(csvCell(null)).toBe("");
  });

  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])("prefixes formula cell %j", (v) => {
    expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("does not prefix a negative number", () => {
    expect(csvCell(-3)).toBe("-3");
  });

  it("toCsv builds BOM, header, day rows, blank line and failure table", () => {
    const csv = toCsv(sample());
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("day,sent,delivered,read,failed");
    expect(lines[1]).toBe("2026-10-09,4,3,2,0");
    expect(lines[2]).toBe("2026-10-10,6,5,3,1");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("code,message,count,share,last_seen");
    expect(lines[5]).toBe("131026,Recipient cannot receive,1,100,2026-10-10T07:00:00.000Z");
  });

  it("toCsv escapes and neutralizes failure messages", () => {
    const a = normalizeAnalytics(body({ failures: [{ code: "1", message: '=HYPERLINK("x","y")', count: 1, share: 100, lastSeenAt: null }] }));
    const lines = toCsv(a).slice(1).split("\r\n");
    expect(lines[5]).toBe(`1,"'=HYPERLINK(""x"",""y"")",1,100,`);
  });

  it("csvFileName sanitizes the name", () => {
    expect(csvFileName("Welcome Offer!", "7d")).toBe("template-welcome-offer-analytics-7d.csv");
    expect(csvFileName("../x\\y", "all")).toBe("template-x-y-analytics-all.csv");
    expect(csvFileName("", "30d")).toBe("template-template-analytics-30d.csv");
  });
});
