import { describe, it, expect, vi } from "vitest";
import { runLookup, MAX_ROWS, type LookupPrisma } from "./lookup-api-request.js";
import type { LookupArgs } from "./lookup-api-request.args.js";

const args: LookupArgs = { org: "org_1", reason: "client ticket 123", sinceHours: 24, showMeta: false, actor: "tester" };
const row = {
  id: "11111111-1111-4111-8111-111111111111", method: "POST", endpoint: "/v1/messages", statusCode: 400, errorCode: "X",
  durationMs: 12, requestBody: '{"a":1}', responseBody: '{"b":2}', clientIp: "9.9.9.9", userAgent: "curl/8", createdAt: new Date("2026-01-01T00:00:00Z"),
};

function mk(opts: { auditFails?: boolean; rows?: unknown[] } = {}) {
  const calls: string[] = [];
  const findMany = vi.fn(async (_a: Record<string, unknown>) => { calls.push("select"); return (opts.rows ?? [row]) as never; });
  const create = vi.fn(async (_a: { data: Record<string, unknown> }) => { calls.push("audit"); if (opts.auditFails) throw new Error("postgres://secret"); return {}; });
  const prisma: LookupPrisma = { apiRequestPayload: { findMany }, apiPayloadAccessAudit: { create } };
  const out = vi.fn((_l: string) => { calls.push("print"); });
  return { prisma, findMany, create, out, calls };
}

describe("runLookup", () => {
  it("writes the audit row before printing anything", async () => {
    const m = mk();
    await runLookup(m.prisma, args, m.out);
    expect(m.calls[0]).toBe("select");
    expect(m.calls[1]).toBe("audit");
    expect(m.calls.length).toBeGreaterThan(2);
    expect(m.calls.slice(2).every((c) => c === "print")).toBe(true);
    const data = m.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ actor: "tester", organizationId: "org_1", reason: "client ticket 123", rowsReturned: 1 });
    expect(JSON.parse(data["query"] as string)).toMatchObject({ apiId: null, sinceHours: 24, showMeta: false });
  });
  it("prints nothing and rejects when the audit insert fails", async () => {
    const m = mk({ auditFails: true });
    await expect(runLookup(m.prisma, args, m.out)).rejects.toThrow();
    expect(m.out).not.toHaveBeenCalled();
  });
  it("always filters by organization, newest first, max 50", async () => {
    const m = mk();
    await runLookup(m.prisma, { ...args, apiId: row.id }, m.out);
    const q = m.findMany.mock.calls[0]![0];
    expect(q["where"]).toMatchObject({ organizationId: "org_1", id: row.id });
    expect(q["orderBy"]).toEqual({ createdAt: "desc" });
    expect(q["take"]).toBe(MAX_ROWS);
    expect(MAX_ROWS).toBe(50);
    const m2 = mk();
    await runLookup(m2.prisma, args, m2.out);
    expect(m2.findMany.mock.calls[0]![0]["where"]).toMatchObject({ organizationId: "org_1", createdAt: { gte: expect.any(Date) } });
  });
  it("hides client ip and user agent unless --show-meta", async () => {
    const m = mk();
    await runLookup(m.prisma, args, m.out);
    const text = m.out.mock.calls.map((c) => c[0]).join("\n");
    expect(text).not.toContain("9.9.9.9");
    expect(text).not.toContain("curl/8");
    expect(text).toContain('{"a":1}');
    expect(text).toContain('{"b":2}');
    const m2 = mk();
    await runLookup(m2.prisma, { ...args, showMeta: true }, m2.out);
    const text2 = m2.out.mock.calls.map((c) => c[0]).join("\n");
    expect(text2).toContain("9.9.9.9");
    expect(text2).toContain("curl/8");
  });
  it("still audits when nothing matches", async () => {
    const m = mk({ rows: [] });
    expect(await runLookup(m.prisma, args, m.out)).toBe(0);
    expect(m.create).toHaveBeenCalledTimes(1);
  });
});
