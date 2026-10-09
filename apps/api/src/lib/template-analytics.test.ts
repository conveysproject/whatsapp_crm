import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { parseRange, getTemplateAnalytics, type AnalyticsRange } from "./template-analytics.js";

const ORG = "org-aaa";
const TEMPLATE = {
  id: "tpl-111",
  name: "order_update",
  language: "en",
  category: "UTILITY",
  status: "approved",
  qualityScore: "GREEN",
  lastEditedTime: new Date("2026-09-01T10:00:00.000Z"),
  bodyText: "Hello {{1}}, your order shipped.",
};
const NOW = new Date("2026-10-10T15:30:00.000Z");

type Sqlish = { sql: string; values: unknown[] };
interface Fixtures {
  statuses?: Array<{ status: string; n: number }>;
  daily?: Array<{ day: string; sent: number; delivered: number; read: number; failed: number }>;
  failures?: Array<{ code: string | null; title: string | null; n: number; last_seen: Date | null }>;
  sources?: Array<{ source: string; n: number }>;
  reach?: Array<{ recipients: number; last_sent: Date | null }>;
}

function mockPrisma(f: Fixtures = {}) {
  const queryRaw = vi.fn(async (q: Sqlish) => {
    const text = q.sql;
    if (text.includes("GROUP BY status")) return f.statuses ?? [];
    if (text.includes("date_trunc")) return f.daily ?? [];
    if (text.includes("delivery_error")) return f.failures ?? [];
    if (text.includes("coalesce(source")) return f.sources ?? [];
    if (text.includes("count(DISTINCT conversation_id)")) return f.reach ?? [{ recipients: 0, last_sent: null }];
    throw new Error(`unexpected query: ${text}`);
  });
  return { prisma: { $queryRaw: queryRaw } as unknown as PrismaClient, queryRaw };
}

const run = (f: Fixtures, range: AnalyticsRange = "30d") => {
  const { prisma, queryRaw } = mockPrisma(f);
  return getTemplateAnalytics(prisma, { organizationId: ORG, template: TEMPLATE, range, now: NOW }).then((result) => ({ result, queryRaw }));
};

const FULL_STATUSES = [
  { status: "sending", n: 1 },
  { status: "sent", n: 2 },
  { status: "delivered", n: 3 },
  { status: "read", n: 4 },
  { status: "failed", n: 1 },
  { status: "expired", n: 1 },
  { status: "aborted", n: 1 },
];

describe("parseRange", () => {
  it("defaults to 30d when absent", () => {
    expect(parseRange(undefined)).toBe("30d");
  });
  it("passes valid values", () => {
    for (const v of ["7d", "30d", "90d", "all"] as const) expect(parseRange(v)).toBe(v);
  });
  it("returns null for anything else", () => {
    for (const v of ["1d", "", "ALL", "7D", 7, null, {}, ["7d"]]) expect(parseRange(v)).toBeNull();
  });
});

describe("funnel math (PRD section 3)", () => {
  it("computes cumulative counts and rates from status counts", async () => {
    const { result } = await run({ statuses: FULL_STATUSES });
    expect(result.inProgress).toBe(1);
    expect(result.sent).toBe(9);
    expect(result.delivered).toBe(7);
    expect(result.read).toBe(4);
    expect(result.failed).toBe(3);
    expect(result.rates).toEqual({ delivery: 77.8, read: 57.1, failure: 25.0 });
  });

  it("returns null rates when denominators are zero", async () => {
    const { result } = await run({ statuses: [] });
    expect(result.sent).toBe(0);
    expect(result.rates).toEqual({ delivery: null, read: null, failure: null });
  });

  it("read rate is null when nothing is delivered but sends exist", async () => {
    const { result } = await run({ statuses: [{ status: "sent", n: 5 }] });
    expect(result.rates).toEqual({ delivery: 0, read: null, failure: 0 });
  });

  it("failure rate is 100 when only failures exist", async () => {
    const { result } = await run({ statuses: [{ status: "failed", n: 2 }] });
    expect(result.rates).toEqual({ delivery: null, read: null, failure: 100 });
  });

  it("ignores unknown status values", async () => {
    const { result } = await run({ statuses: [...FULL_STATUSES, { status: "mystery", n: 50 }, { status: "", n: 7 }] });
    expect(result.sent).toBe(9);
    expect(result.failed).toBe(3);
    expect(result.inProgress).toBe(1);
  });
});

describe("range", () => {
  const fromOf = async (range: AnalyticsRange) => {
    const { queryRaw } = (await run({}, range));
    return queryRaw.mock.calls.map(([q]) => (q as Sqlish).values);
  };

  it("7d uses the start of the UTC day seven days back", async () => {
    for (const values of await fromOf("7d")) expect(values).toContainEqual(new Date("2026-10-03T00:00:00.000Z"));
  });
  it("30d and 90d", async () => {
    for (const values of await fromOf("30d")) expect(values).toContainEqual(new Date("2026-09-10T00:00:00.000Z"));
    for (const values of await fromOf("90d")) expect(values).toContainEqual(new Date("2026-07-12T00:00:00.000Z"));
  });
  it("all has no lower bound and no sent_at predicate", async () => {
    const { queryRaw } = await run({}, "all");
    for (const [q] of queryRaw.mock.calls) {
      const s = q as Sqlish;
      expect(s.sql).not.toContain("sent_at >=");
      expect(s.values.some((v) => v instanceof Date)).toBe(false);
    }
  });
  it("echoes the range", async () => {
    expect((await run({}, "90d")).result.range).toBe("90d");
  });
});

describe("daily series", () => {
  it("zero-fills missing days between from and today (UTC)", async () => {
    const { result } = await run({ daily: [{ day: "2026-10-08", sent: 3, delivered: 2, read: 1, failed: 1 }] }, "7d");
    expect(result.daily).toHaveLength(8);
    expect(result.daily[0]).toEqual({ day: "2026-10-03", sent: 0, delivered: 0, read: 0, failed: 0 });
    expect(result.daily[5]).toEqual({ day: "2026-10-08", sent: 3, delivered: 2, read: 1, failed: 1 });
    expect(result.daily[7]).toEqual({ day: "2026-10-10", sent: 0, delivered: 0, read: 0, failed: 0 });
  });

  it("for all, starts at the first message day", async () => {
    const { result } = await run({ daily: [{ day: "2026-10-07", sent: 1, delivered: 1, read: 1, failed: 0 }] }, "all");
    expect(result.daily.map((d) => d.day)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  });

  it("for all with no messages returns a single zero row for today", async () => {
    const { result } = await run({ daily: [] }, "all");
    expect(result.daily).toEqual([{ day: "2026-10-10", sent: 0, delivered: 0, read: 0, failed: 0 }]);
  });

  it("caps at 366 rows and keeps the LAST 366 days for all", async () => {
    const { result } = await run({ daily: [{ day: "2020-01-01", sent: 9, delivered: 9, read: 9, failed: 0 }, { day: "2026-10-09", sent: 1, delivered: 0, read: 0, failed: 0 }] }, "all");
    expect(result.daily).toHaveLength(366);
    expect(result.daily[365]?.day).toBe("2026-10-10");
    expect(result.daily[0]?.day).toBe("2025-10-10");
    expect(result.daily.find((d) => d.day === "2026-10-09")?.sent).toBe(1);
    expect(result.daily.some((d) => d.day === "2020-01-01")).toBe(false);
  });
});

describe("failures", () => {
  it("maps codes to plain-language text, share of total failed, ISO dates", async () => {
    const { result } = await run({
      statuses: [{ status: "sent", n: 6 }, { status: "failed", n: 4 }],
      failures: [
        { code: "131049", title: "Healthy ecosystem engagement", n: 3, last_seen: new Date("2026-10-09T08:00:00.000Z") },
        { code: null, title: null, n: 1, last_seen: null },
      ],
    });
    expect(result.failures).toEqual([
      {
        code: "131049",
        title: "Healthy ecosystem engagement",
        message: "WhatsApp did not deliver this marketing message to this recipient to keep engagement healthy. Wait at least 24 hours before trying again.",
        count: 3,
        share: 75.0,
        lastSeenAt: "2026-10-09T08:00:00.000Z",
      },
      { code: "unknown", title: null, message: "WhatsApp could not deliver the message.", count: 1, share: 25.0, lastSeenAt: null },
    ]);
  });

  it("uses the generic sentence with the code for unmapped numeric codes and treats non-numeric codes as unknown", async () => {
    const { result } = await run({
      statuses: [{ status: "failed", n: 2 }],
      failures: [
        { code: "999999", title: "Odd", n: 1, last_seen: null },
        { code: "abc", title: "Weird", n: 1, last_seen: null },
      ],
    });
    expect(result.failures[0]?.message).toBe("WhatsApp could not deliver the message (code 999999).");
    expect(result.failures[1]?.code).toBe("unknown");
    expect(result.failures[1]?.message).toBe("WhatsApp could not deliver the message.");
  });

  it("limits the query to the top 10 and shares add up to about 100", async () => {
    const rows = Array.from({ length: 3 }, (_v, i) => ({ code: String(131000 + i), title: `t${i}`, n: 1, last_seen: null }));
    const { result, queryRaw } = await run({ statuses: [{ status: "failed", n: 3 }], failures: rows });
    const sum = result.failures.reduce((a, f) => a + f.share, 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.5);
    const failureSql = queryRaw.mock.calls.map(([q]) => q as Sqlish).find((q) => q.sql.includes("delivery_error"));
    expect(failureSql?.sql).toMatch(/LIMIT 10/);
  });

  it("slices to 10 rows even if more come back", async () => {
    const rows = Array.from({ length: 12 }, (_v, i) => ({ code: String(131000 + i), title: null, n: 12 - i, last_seen: null }));
    const { result } = await run({ statuses: [{ status: "failed", n: 78 }], failures: rows });
    expect(result.failures).toHaveLength(10);
    expect(result.failures[0]?.count).toBe(12);
  });

  it("share is 0 when no failed total", async () => {
    const { result } = await run({ statuses: [], failures: [{ code: "131049", title: null, n: 1, last_seen: null }] });
    expect(result.failures[0]?.share).toBe(0);
  });
});

describe("sources", () => {
  it("passes through source counts sorted by count desc, NULL as unknown", async () => {
    const { result } = await run({
      sources: [
        { source: "api", n: 2 },
        { source: "unknown", n: 9 },
        { source: "campaign", n: 5 },
      ],
    });
    expect(result.sources).toEqual([
      { source: "unknown", count: 9 },
      { source: "campaign", count: 5 },
      { source: "api", count: 2 },
    ]);
  });

  it("maps empty or null source values to unknown and merges them", async () => {
    const { result } = await run({
      sources: [
        { source: null as unknown as string, n: 1 },
        { source: "unknown", n: 2 },
        { source: "flow", n: 1 },
      ],
    });
    expect(result.sources).toEqual([
      { source: "unknown", count: 3 },
      { source: "flow", count: 1 },
    ]);
  });

  it("the query coalesces NULL source to unknown", async () => {
    const { queryRaw } = await run({});
    const q = queryRaw.mock.calls.map(([x]) => x as Sqlish).find((x) => x.sql.includes("coalesce(source"));
    expect(q?.sql).toContain("coalesce(source, 'unknown')");
  });
});

describe("reach and template card", () => {
  it("returns unique recipients and last sent", async () => {
    const { result } = await run({ reach: [{ recipients: 4, last_sent: new Date("2026-10-09T12:00:00.000Z") }] });
    expect(result.reach).toEqual({ uniqueRecipients: 4, lastSentAt: "2026-10-09T12:00:00.000Z" });
  });
  it("returns null lastSentAt when nothing was sent", async () => {
    const { result } = await run({ reach: [{ recipients: 0, last_sent: null }] });
    expect(result.reach).toEqual({ uniqueRecipients: 0, lastSentAt: null });
  });
  it("shapes the template block", async () => {
    const { result } = await run({});
    expect(result.template).toEqual({
      name: "order_update",
      language: "en",
      category: "UTILITY",
      status: "approved",
      qualityScore: "GREEN",
      lastEditedAt: "2026-09-01T10:00:00.000Z",
      previewText: "Hello {{1}}, your order shipped.",
    });
  });
});

describe("org and template isolation in SQL", () => {
  for (const range of ["7d", "30d", "90d", "all"] as const) {
    it(`every raw query binds organizationId and template.id and the fixed predicates (${range})`, async () => {
      const { queryRaw } = await run({}, range);
      expect(queryRaw).toHaveBeenCalledTimes(5);
      for (const [q] of queryRaw.mock.calls) {
        const s = q as Sqlish;
        expect(s.values).toContain(ORG);
        expect(s.values).toContain(TEMPLATE.id);
        expect(s.sql).toContain("organization_id = ?");
        expect(s.sql).toContain("template_id = ?");
        expect(s.sql).toContain("direction = 'outbound'");
        expect(s.sql).toContain("content_type = 'template'");
        expect(s.sql).not.toContain(ORG);
        expect(s.sql).not.toContain(TEMPLATE.id);
        if (range !== "all") expect(s.sql).toContain("sent_at >= ?");
      }
    });
  }

  it("never selects bodies or phone numbers", async () => {
    const { queryRaw } = await run({});
    for (const [q] of queryRaw.mock.calls) {
      const sql = (q as Sqlish).sql.toLowerCase();
      expect(sql).not.toMatch(/\bbody\b|phone|rich_content/);
    }
  });
});
