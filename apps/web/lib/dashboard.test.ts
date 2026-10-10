import { describe, it, expect, vi } from "vitest";
import { normalizeDashboard, fetchDashboard, DashboardError } from "./dashboard";

describe("normalizeDashboard", () => {
  it("returns safe defaults for an empty body", () => {
    const d = normalizeDashboard({});
    expect(d.attention).toEqual([]);
    expect(d.campaignFunnel).toBeNull();
    expect(d.kpis.openConversations.value).toBe(0);
    expect(d.kpis.newConversations).toEqual({ value: 0, previous: 0, deltaPct: null });
    expect(d.kpis.messages).toEqual({ value: 0, previous: 0, deltaPct: null, inbound: 0, outbound: 0 });
    expect(d.kpis.firstReplySecs).toEqual({ value: null, previous: null, deltaPct: null });
  });
  it("never throws on non-object input", () => {
    expect(() => normalizeDashboard(null)).not.toThrow();
    expect(() => normalizeDashboard("x")).not.toThrow();
    expect(() => normalizeDashboard({ attention: "bad", kpis: 5, campaignFunnel: 3 })).not.toThrow();
  });
  it("keeps valid attention items and drops malformed ones", () => {
    const d = normalizeDashboard({
      attention: [
        { key: "unanswered", severity: "warning", count: 3, label: "Unanswered chats", href: "/inbox" },
        { key: "x" },
        null,
      ],
    });
    expect(d.attention).toHaveLength(1);
    expect(d.attention[0]!.href).toBe("/inbox");
  });
  it("keeps a funnel with a null previous", () => {
    const f = { id: "c1", name: "Promo", sentAt: "2026-10-01T00:00:00.000Z", sent: 10, delivered: 8, read: 4, failed: 1 };
    const d = normalizeDashboard({ campaignFunnel: { current: f, previous: null } });
    expect(d.campaignFunnel).toEqual({ current: f, previous: null });
  });
  it("returns a null funnel when current is missing", () => {
    expect(normalizeDashboard({ campaignFunnel: { current: null, previous: null } }).campaignFunnel).toBeNull();
  });
  it("passes through kpi values", () => {
    const d = normalizeDashboard({
      kpis: { newContacts: { value: 1, previous: 0, deltaPct: null }, firstReplySecs: { value: 90, previous: 100, deltaPct: -10 } },
    });
    expect(d.kpis.newContacts.value).toBe(1);
    expect(d.kpis.firstReplySecs).toEqual({ value: 90, previous: 100, deltaPct: -10 });
  });
});

describe("fetchDashboard", () => {
  const getToken = async (): Promise<string | null> => "tok";
  it("throws DashboardError with status 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(fetchDashboard(getToken, "7d", "UTC")).rejects.toMatchObject({ name: "DashboardError", status: 403 });
    await expect(fetchDashboard(getToken, "7d", "UTC")).rejects.toBeInstanceOf(DashboardError);
  });
  it("sends bearer token, range and encoded tz, and unwraps data", async () => {
    const f = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ data: { range: "30d", tz: "Asia/Kolkata", attention: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const d = await fetchDashboard(getToken, "30d", "Asia/Kolkata");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/analytics/dashboard?range=30d&tz=Asia%2FKolkata");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(d.range).toBe("30d");
  });
  it("throws DashboardError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("net"); }));
    await expect(fetchDashboard(getToken, "7d", "UTC")).rejects.toBeInstanceOf(DashboardError);
  });
});

describe("attention href safety", () => {
  const item = (href: string) => ({ key: "templates", severity: "warning", count: 1, label: "L", href });
  it.each(["javascript:alert(1)", "//evil.com", "https://evil.com", "/\\evil.com", "/a\nb"])("falls back to /inbox for %s", (href) => {
    expect(normalizeDashboard({ attention: [item(href)] }).attention[0]!.href).toBe("/inbox");
  });
  it("keeps a valid internal path", () => {
    expect(normalizeDashboard({ attention: [item("/templates")] }).attention[0]!.href).toBe("/templates");
  });
});
