import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApiUsageError,
  appendRows,
  chartData,
  credentialDisplayName,
  formatWindowStart,
  spansLocalDays,
  endpointLabel,
  errorClassLabel,
  errorCount,
  fetchFailedRequests,
  fetchSummary,
  formatCount,
  formatDuration,
  formatPercent,
  isChartEmpty,
  isNotAvailable,
  messageForUsageError,
  normalizeCounts,
  normalizeRequestsPage,
  normalizeSummary,
  requestsQuery,
  successRate,
  summaryQuery,
  unwrapSummary,
  type RequestRow,
} from "./api-usage";

const row = (id: string): RequestRow => ({
  id, createdAt: "2026-10-06T10:00:00.000Z", method: "POST", endpoint: "message.send", statusCode: 400,
  outcome: "client_error", errorClass: "validation", durationMs: 12, messages: 0, requestId: "r", apiKeyId: "k1",
});

function mockFetch(status: number, body?: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("success rate and error math", () => {
  it("is null with zero requests and a fraction otherwise", () => {
    expect(successRate({ success: 0, requests: 0 })).toBeNull();
    expect(successRate({ success: 3, requests: 4 })).toBe(0.75);
  });
  it("formats null as an em dash and trims whole percentages", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
  it("errors exclude failed sign-ins and never go negative", () => {
    expect(errorCount({ clientErrors: 3, serverErrors: 1, failedSignins: 1 })).toBe(3);
    expect(errorCount({ clientErrors: 0, serverErrors: 0, failedSignins: 5 })).toBe(0);
  });
});

describe("formatting", () => {
  it("formats counts and durations", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(Number.NaN)).toBe("0");
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(123.4)).toBe("123 ms");
    expect(formatDuration(12_500)).toBe("12.5 s");
    expect(formatDuration(-1)).toBe("0 ms");
  });
});

describe("labels", () => {
  it("maps endpoint keys and falls back to Other (incl. prototype keys)", () => {
    expect(endpointLabel("message.send")).toBe("Send message");
    expect(endpointLabel("message.list")).toBe("List messages");
    expect(endpointLabel("message.get")).toBe("Get message");
    expect(endpointLabel("other")).toBe("Other");
    expect(endpointLabel("something.new")).toBe("Other");
    expect(endpointLabel("constructor")).toBe("Other");
  });
  it("maps error classes", () => {
    expect(errorClassLabel("auth")).toBe("Failed sign-in");
    expect(errorClassLabel("rate_limited")).toBe("Rate limited");
    expect(errorClassLabel("server")).toBe("Server error");
    expect(errorClassLabel("weird")).toBe("Error");
    expect(errorClassLabel(null)).toBe("—");
  });
});

describe("chartData", () => {
  const series = [{ t: "2026-10-05", requests: 5, success: 3, errors: 1, failedSignins: 1 }, { t: "2026-10-06", requests: 0, success: 0, errors: 0, failedSignins: 0 }];
  it("labels day buckets with the UTC date (no timezone shift)", () => {
    const d = chartData(series, "day");
    expect(d.map((b) => b.label)).toEqual(["10-05", "10-06"]);
    expect(d[0]).toMatchObject({ success: 3, errors: 1, failedSignins: 1, total: 5 });
  });
  it("labels hour buckets with the browser's local time", () => {
    const iso = "2026-10-06T13:00:00Z";
    const d = chartData([{ t: iso, requests: 1, success: 1, errors: 0, failedSignins: 0 }], "hour");
    expect(d[0]!.label).toBe(new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    expect(d[0]!.t).toBe(iso);
  });
  it("hourly labels include the weekday and tooltips always do when buckets span two local days", () => {
    const mk = (t: string) => ({ t, requests: 1, success: 1, errors: 0, failedSignins: 0 });
    const a = new Date(2026, 9, 6, 22, 0, 0).toISOString();
    const b = new Date(2026, 9, 7, 3, 0, 0).toISOString();
    const multi = chartData([mk(a), mk(b)], "hour");
    expect(spansLocalDays([mk(a), mk(b)])).toBe(true);
    expect(multi[0]!.label).toBe(new Date(a).toLocaleString([], { weekday: "short", hour: "numeric" }));
    expect(multi[0]!.label).toMatch(/Tue/);
    expect(multi[0]!.label).not.toBe(multi[1]!.label);
    expect(multi[0]!.fullLabel).toMatch(/Tue/);
    const same = chartData([mk(new Date(2026, 9, 6, 10, 0).toISOString())], "hour");
    expect(spansLocalDays([mk(a)])).toBe(false);
    expect(same[0]!.label).not.toMatch(/Tue/);
    expect(same[0]!.fullLabel).toMatch(/Tue/);
    expect(chartData([mk("2026-10-06")], "day")[0]!.fullLabel).toBe("2026-10-06");
  });
  it("formats the window start in local time and tolerates garbage", () => {
    const iso = new Date(2026, 9, 6, 15, 42).toISOString();
    expect(formatWindowStart(iso)).toMatch(/Tue/);
    expect(formatWindowStart("nope")).toBe("");
  });
  it("detects an all-zero chart", () => {
    expect(isChartEmpty(chartData([series[1]!], "day"))).toBe(true);
    expect(isChartEmpty(chartData(series, "day"))).toBe(false);
    expect(isChartEmpty([])).toBe(true);
  });
});

describe("query strings and cursors", () => {
  it("builds the summary query with and without a credential", () => {
    expect(summaryQuery("7d")).toBe("range=7d");
    expect(summaryQuery("24h", null)).toBe("range=24h");
    expect(summaryQuery("30d", "key_1")).toBe("range=30d&apiKeyId=key_1");
  });
  it("builds the failed-requests query with cursor and credential, encoding values", () => {
    expect(requestsQuery()).toBe("outcome=error&limit=20");
    expect(requestsQuery({ cursor: "abc_-", apiKeyId: "k1" })).toBe("outcome=error&limit=20&cursor=abc_-&apiKeyId=k1");
    expect(requestsQuery({ cursor: "a b&c" })).toBe("outcome=error&limit=20&cursor=a+b%26c");
    expect(requestsQuery({ cursor: null, endpoint: "message.send", limit: 5 })).toBe("outcome=error&limit=5&endpoint=message.send");
  });
  it("sends the range preset to the requests endpoint", () => {
    expect(requestsQuery({ range: "24h" })).toBe("outcome=error&limit=20&range=24h");
    expect(requestsQuery({ range: "7d", cursor: "c", apiKeyId: "k1" })).toBe("outcome=error&limit=20&range=7d&cursor=c&apiKeyId=k1");
    expect(requestsQuery({ range: null })).toBe("outcome=error&limit=20");
  });
  it("names credentials: em dash when unattributed, 'Other credential' when unknown", () => {
    const names = new Map([["k1", "Production"]]);
    expect(credentialDisplayName("k1", names)).toBe("Production");
    expect(credentialDisplayName("zz", names)).toBe("Other credential");
    expect(credentialDisplayName(null, names)).toBe("—");
  });
  it("appends pages without duplicating rows", () => {
    expect(appendRows([row("a"), row("b")], [row("b"), row("c")]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("normalises the cursor: empty or missing becomes null", () => {
    expect(normalizeRequestsPage({ data: [], nextCursor: "abc" }).nextCursor).toBe("abc");
    expect(normalizeRequestsPage({ data: [], nextCursor: "" }).nextCursor).toBeNull();
    expect(normalizeRequestsPage({ data: [] }).nextCursor).toBeNull();
    expect(normalizeRequestsPage(null)).toEqual({ data: [], nextCursor: null });
  });
});

describe("normalisers", () => {
  it("turns garbage into zeros, never NaN", () => {
    const c = normalizeCounts({ requests: "5", success: Number.NaN, errorRate: 0.5 });
    expect(c.requests).toBe(0);
    expect(c.success).toBe(0);
    expect(c.errorRate).toBe(0.5);
  });
  it("normalises a full summary, stringifies failure codes and fills all six statuses", () => {
    const s = normalizeSummary({
      range: { from: "a", to: "b", granularity: "hour", approximate: true },
      totals: { requests: 10, success: 8 },
      series: [{ t: "x", requests: 1, success: 1, errors: 0, failedSignins: 0 }, "junk"],
      byEndpoint: [{ endpoint: "message.send", requests: 2 }],
      byCredential: [{ apiKeyId: "k", name: "Prod", revoked: true, lastUsedAt: null, requests: 2 }],
      messagesByStatus: { sent: 2 },
      topFailureReasons: [{ code: 131049, title: null, count: 2 }, { code: null, title: "X", count: 1 }],
    });
    expect(s.range).toEqual({ from: "a", to: "b", granularity: "hour", approximate: true });
    expect(s.series).toHaveLength(1);
    expect(s.byCredential[0]).toMatchObject({ name: "Prod", revoked: true });
    expect(s.messagesByStatus).toEqual({ queued: 0, sent: 2, delivered: 0, read: 0, failed: 0, undelivered: 0 });
    expect(s.topFailureReasons).toEqual([{ code: "131049", title: null, count: 2 }, { code: null, title: "X", count: 1 }]);
  });
  it("tolerates missing OPTIONAL fields (zero-fills numbers/lists) when the three required parts are present", () => {
    const s = normalizeSummary({ totals: {}, range: {}, series: [] });
    expect(s.totals.requests).toBe(0);
    expect(s.range.granularity).toBe("day");
    expect(s.byCredential).toEqual([]);
    expect(s.messagesByStatus.sent).toBe(0);
  });
  it("throws ApiUsageError when totals/range is not an object or series is not an array", () => {
    const ok = { totals: {}, range: {}, series: [] };
    for (const bad of [undefined, null, "x", [], {}, { ...ok, totals: null }, { ...ok, totals: [] }, { ...ok, range: "7d" }, { ...ok, series: {} }, { ...ok, series: undefined }]) {
      expect(() => normalizeSummary(bad), JSON.stringify(bad)).toThrow(ApiUsageError);
    }
  });
  it("unwraps either a bare summary or a { data } envelope", () => {
    const bare = { totals: {}, series: [] };
    expect(unwrapSummary(bare)).toBe(bare);
    expect(unwrapSummary({ data: bare })).toBe(bare);
  });
});

describe("errors and fetch wrappers", () => {
  it("detects API_NOT_AVAILABLE and builds messages", () => {
    expect(isNotAvailable(new ApiUsageError("API_NOT_AVAILABLE", "x", 403))).toBe(true);
    expect(isNotAvailable(new ApiUsageError("INVALID_QUERY", "x", 400))).toBe(false);
    expect(isNotAvailable(new Error("x"))).toBe(false);
    expect(messageForUsageError(new ApiUsageError("INVALID_QUERY", "range must be 24h", 400))).toBe("range must be 24h");
    expect(messageForUsageError(new ApiUsageError("FORBIDDEN", "x", 403))).toMatch(/permission/);
    expect(messageForUsageError("boom")).toBe("Something went wrong. Please try again.");
  });
  it("fetchSummary rejects a 200 body that is not a summary ({} / empty envelope)", async () => {
    for (const body of [{}, { data: {} }, null, { data: [] }]) {
      mockFetch(200, body);
      await expect(fetchSummary("7d")).rejects.toBeInstanceOf(ApiUsageError);
    }
  });
  it("fetchSummary accepts the bare object the backend sends", async () => {
    mockFetch(200, { totals: { requests: 4 }, range: { granularity: "hour" }, series: [] });
    expect((await fetchSummary("24h")).totals.requests).toBe(4);
  });
  it("fetchSummary calls the proxy URL and carries the server error code", async () => {
    const fn = mockFetch(200, { data: { totals: { requests: 3 }, range: { granularity: "day" }, series: [] } });
    const s = await fetchSummary("30d", "k1");
    expect(fn).toHaveBeenCalledWith("/api/v1/api-usage/summary?range=30d&apiKeyId=k1");
    expect(s.totals.requests).toBe(3);

    mockFetch(403, { error: { code: "API_NOT_AVAILABLE", message: "nope" } });
    await expect(fetchSummary("7d")).rejects.toMatchObject({ code: "API_NOT_AVAILABLE", status: 403 });
  });
  it("fetchFailedRequests passes the cursor and maps network failures", async () => {
    const fn = mockFetch(200, { data: [row("a")], nextCursor: "n1" });
    const p = await fetchFailedRequests({ cursor: "c0", apiKeyId: "k1" });
    expect(fn).toHaveBeenCalledWith("/api/v1/api-usage/requests?outcome=error&limit=20&cursor=c0&apiKeyId=k1");
    await fetchFailedRequests({ range: "30d" });
    expect(fn).toHaveBeenLastCalledWith("/api/v1/api-usage/requests?outcome=error&limit=20&range=30d");
    expect(p.nextCursor).toBe("n1");
    expect(p.data).toHaveLength(1);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(fetchFailedRequests()).rejects.toMatchObject({ code: "NETWORK" });
  });
});
