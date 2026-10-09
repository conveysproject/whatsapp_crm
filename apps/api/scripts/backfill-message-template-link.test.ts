import { describe, it, expect, vi } from "vitest";
import { runBackfill, BATCH_SIZE, type BackfillPrisma } from "./backfill-message-template-link.js";

const sqlOf = (s: TemplateStringsArray) => s.join("?");
const json = (n: string) => JSON.stringify({ templateName: n });

function mk(msgPages: unknown[][], templates: unknown[]) {
  const updates: Array<{ sql: string; values: unknown[] }> = [];
  const unsafe: string[] = [];
  let page = 0;
  const db = {
    $queryRaw: vi.fn(async (s: TemplateStringsArray, ..._v: unknown[]) => {
      const q = sqlOf(s);
      if (q.includes("FROM messages")) return msgPages[page++] ?? [];
      if (q.includes("FROM templates")) return templates;
      return [];
    }),
    $executeRaw: vi.fn(async (s: TemplateStringsArray, ...values: unknown[]) => {
      updates.push({ sql: sqlOf(s), values });
      return (values[0] as unknown[]).length;
    }),
    $executeRawUnsafe: vi.fn(async (q: string) => { unsafe.push(q); return 0; }),
  };
  const prisma = { ...db, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)) } as unknown as BackfillPrisma;
  return { prisma, db, updates, unsafe };
}
const msg = (id: string, org: string, body: string, extra: Record<string, unknown> = {}) =>
  ({ id, organization_id: org, body, rich_content: null, has_api_meta: false, ...extra });
const tpls = [
  { id: "t1", organization_id: "A", name: "one" },
  { id: "t2a", organization_id: "A", name: "multi" },
  { id: "t2b", organization_id: "A", name: "multi" },
];

describe("runBackfill", () => {
  const rows = [msg("m1", "A", json("one")), msg("m2", "A", json("multi")), msg("m3", "A", json("zzz")), msg("m4", "B", json("one"))];

  it("dry run: read-only transaction, no UPDATE, per-org counts printed", async () => {
    const m = mk([rows], tpls);
    const lines: string[] = [];
    const s = await runBackfill(m.prisma, { apply: false }, (l) => lines.push(l));
    expect(m.unsafe).toEqual(["SET TRANSACTION READ ONLY"]);
    expect(m.db.$executeRaw).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("org A: to_update=1 ambiguous=1 unmatched=1");
    expect(lines.join("\n")).toContain("org B: to_update=0 ambiguous=0 unmatched=1");
    expect(lines.join("\n")).toContain("TOTAL: to_update=1 ambiguous=1 unmatched=2");
    expect(lines[0]).toContain("DRY RUN");
    expect(s.apply).toBe(false);
  });

  it("apply: one batched parameterized UPDATE with organization_id and template_id IS NULL", async () => {
    const m = mk([[msg("m1", "A", json("one")), msg("m5", "A", json("one"), { has_api_meta: true }), msg("m6", "A", "one")]], tpls);
    const lines: string[] = [];
    const s = await runBackfill(m.prisma, { apply: true }, (l) => lines.push(l));
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.updates).toHaveLength(1);
    const u = m.updates[0]!;
    expect(u.sql).toContain("m.organization_id = v.organization_id");
    expect(u.sql).toContain("m.template_id IS NULL");
    expect(u.sql).toContain("COALESCE(m.source, v.source)");
    expect(u.values).toEqual([["m1", "m5", "m6"], ["A", "A", "A"], ["t1", "t1", "t1"], [null, "api", "flow"]]);
    expect(s.updatedRows).toBe(3);
    expect(lines.join("\n")).toContain("updated_rows=3");
  });

  it("idempotent: a second pass finds no rows and issues no UPDATE", async () => {
    const m = mk([[]], tpls);
    const s = await runBackfill(m.prisma, { apply: true }, () => undefined);
    expect(m.db.$executeRaw).not.toHaveBeenCalled();
    expect(s.updatedRows).toBe(0);
    expect(s.total.update).toBe(0);
  });

  it("pages with keyset pagination in batches of BATCH_SIZE and one UPDATE per batch", async () => {
    const page1 = Array.from({ length: BATCH_SIZE }, (_v, i) => msg(`m${String(i).padStart(4, "0")}`, "A", json("one")));
    const page2 = [msg("m9999", "A", json("one"))];
    const m = mk([page1, page2], tpls);
    await runBackfill(m.prisma, { apply: true }, () => undefined);
    expect(m.updates).toHaveLength(2);
    expect((m.updates[0]!.values[0] as unknown[]).length).toBe(BATCH_SIZE);
    const selects = m.db.$queryRaw.mock.calls.filter((c) => sqlOf(c[0]).includes("FROM messages"));
    expect(selects).toHaveLength(2);
    expect(selects[1]!.slice(1)).toContain(`m${String(BATCH_SIZE - 1).padStart(4, "0")}`); // cursor = last id of page 1
  });

  it("filters by organization when --org is given", async () => {
    const m = mk([[msg("m1", "A", json("one"))]], tpls);
    await runBackfill(m.prisma, { org: "A", apply: false }, () => undefined);
    const sel = m.db.$queryRaw.mock.calls.find((c) => sqlOf(c[0]).includes("FROM messages"))!;
    expect(sqlOf(sel[0])).toContain("m.organization_id = ?");
    expect(sel.slice(1)).toContain("A");
  });

  it("counts campaign rows as unattributed candidates and does not update them", async () => {
    const m = mk([[msg("m1", "A", "Hello Anna", { rich_content: { buttons: [] } })]], tpls);
    const lines: string[] = [];
    await runBackfill(m.prisma, { apply: true }, (l) => lines.push(l));
    expect(lines.join("\n")).toContain("unattributed_campaign_candidates=1");
    expect(m.db.$executeRaw).not.toHaveBeenCalled();
  });
});
