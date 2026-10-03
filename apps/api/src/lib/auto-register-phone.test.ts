import { describe, it, expect, vi } from "vitest";
import {
  skipReason,
  processOrg,
  selectEligibleOrgIds,
  nextDelayMs,
  MAX_ATTEMPTS,
  type Deps,
} from "./auto-register-phone.js";

const NOW = new Date("2026-10-04T10:00:00Z");
const base = (extra: Record<string, string> = {}): Record<string, string> => ({
  current_phone_number_id: "pn-1",
  whatsapp_access_token: "TOKEN-SECRET",
  webhook_verified_at: "2026-10-04T09:00:00Z",
  ...extra,
});

type Reply = { status: number; body: unknown } | "network";

function makeDeps(initial: Record<string, string>, replies: Reply[]) {
  const store = { ...initial };
  const audits: Array<Record<string, unknown>> = [];
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const queue = [...replies];
  const fetchFn = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    const r = queue.shift();
    if (!r) throw new Error("unexpected fetch");
    if (r === "network") throw new Error("boom");
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  });
  const deps: Deps = {
    getSettings: async () => ({ ...store }),
    setSettings: async (_org, kv) => { Object.assign(store, kv); },
    acquireLock: async () => true,
    releaseLock: async () => undefined,
    fetchFn: fetchFn as unknown as typeof fetch,
    audit: async (e) => { audits.push(e); },
    now: () => NOW,
    randomPin: () => "424242",
  };
  return { deps, store, audits, calls, fetchFn };
}

const unregistered = { status: 200, body: { status: "PENDING", platform_type: "NOT_APPLICABLE", is_on_biz_app: false, code_verification_status: "VERIFIED" } };
const registered = { status: 200, body: { status: "CONNECTED", platform_type: "CLOUD_API", is_on_biz_app: false, code_verification_status: "VERIFIED" } };

describe("skipReason (database only, no Meta call)", () => {
  it("returns null for a connected-but-unregistered org outside the grace window", () => {
    expect(skipReason(base(), NOW)).toBeNull();
  });
  it.each([
    ["not_connected", {}, { current_phone_number_id: "" }],
    ["token_expired", { whatsapp_access_token_expired: "1" }, {}],
    ["connected", { phone_info_status: "CONNECTED" }, {}],
    ["done", { wa_register_done: "true" }, {}],
    ["biz_app", { phone_info_is_on_biz_app: "true" }, {}],
    ["blocked", { wa_register_blocked: "token_invalid" }, {}],
    ["max_attempts", { wa_register_attempts: String(MAX_ATTEMPTS) }, {}],
    ["backoff", { wa_register_next_at: "2026-10-04T11:00:00Z" }, {}],
    ["connect_grace", { webhook_verified_at: "2026-10-04T09:58:00Z" }, {}],
  ])("skips: %s", (reason, extra, override) => {
    expect(skipReason({ ...base(extra), ...override }, NOW)).toBe(reason);
  });
  it("does not skip when the backoff time has passed", () => {
    expect(skipReason(base({ wa_register_next_at: "2026-10-04T09:00:00Z" }), NOW)).toBeNull();
  });
});

describe("nextDelayMs ladder", () => {
  it("15 min, 1 h, 6 h, then 24 h", () => {
    expect([1, 2, 3, 4, 9].map(nextDelayMs)).toEqual([15 * 60e3, 3600e3, 6 * 3600e3, 24 * 3600e3, 24 * 3600e3]);
  });
});

describe("processOrg", () => {
  it("registers an unregistered number once, stores state and an audit row (no secrets)", async () => {
    const { deps, store, audits, calls } = makeDeps(base(), [unregistered, { status: 200, body: { success: true } }, registered]);
    const r = await processOrg(deps, "org-1");
    expect(r).toMatchObject({ outcome: "registered", nextDelayMs: null });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET"]);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ messaging_product: "whatsapp", pin: "424242" });
    expect(store["wa_register_pin"]).toBe("424242");
    expect(store["wa_register_done"]).toBe("true");
    expect(store["phone_info_status"]).toBe("CONNECTED");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: "system:auto-register", action: "whatsapp.auto_register", targetId: "org-1" });
    const dump = JSON.stringify([audits, store.wa_register_last_result]);
    expect(dump).not.toContain("TOKEN-SECRET");
    expect(dump).not.toContain("424242");
  });

  it("reuses the stored PIN on a retry", async () => {
    const { deps, calls } = makeDeps(base({ wa_register_pin: "111111" }), [unregistered, { status: 200, body: { success: true } }, registered]);
    await processOrg(deps, "org-1");
    expect(JSON.parse(calls[1]!.body!).pin).toBe("111111");
  });

  it("already registered at Meta: marks done, never calls register", async () => {
    const { deps, store, calls } = makeDeps(base(), [registered]);
    const r = await processOrg(deps, "org-1");
    expect(r).toMatchObject({ outcome: "already_registered", nextDelayMs: null });
    expect(calls).toHaveLength(1);
    expect(store["wa_register_done"]).toBe("true");
  });

  it("Business-app number at Meta: marks done, never calls register", async () => {
    const { deps, store, calls } = makeDeps(base(), [{ status: 200, body: { status: "PENDING", platform_type: "NOT_APPLICABLE", is_on_biz_app: true, code_verification_status: "VERIFIED" } }]);
    const r = await processOrg(deps, "org-1");
    expect(r.outcome).toBe("skipped_biz_app");
    expect(calls).toHaveLength(1);
    expect(store["wa_register_done"]).toBe("true");
  });

  it("verification not complete: backs off without registering or counting an attempt", async () => {
    const { deps, store, calls } = makeDeps(base(), [{ status: 200, body: { status: "PENDING", platform_type: "NOT_APPLICABLE", is_on_biz_app: false, code_verification_status: "NOT_VERIFIED" } }]);
    const r = await processOrg(deps, "org-1");
    expect(r.outcome).toBe("waiting_for_verification");
    expect(r.nextDelayMs).toBe(15 * 60e3);
    expect(calls).toHaveLength(1);
    expect(store["wa_register_attempts"]).toBeUndefined();
  });

  it("stored-state skip makes zero Meta calls", async () => {
    const cases: Array<Record<string, string>> = [{ phone_info_status: "CONNECTED" }, { wa_register_done: "true" }, { wa_register_blocked: "x" }];
    for (const extra of cases) {
      const { deps, fetchFn } = makeDeps(base(extra), []);
      const r = await processOrg(deps, "org-1");
      expect(r.outcome).toMatch(/^skip_/);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("token invalid (401): blocks the org, no retry scheduled", async () => {
    const { deps, store } = makeDeps(base(), [{ status: 401, body: { error: { type: "OAuthException", code: 190 } } }]);
    const r = await processOrg(deps, "org-1");
    expect(r).toMatchObject({ outcome: "blocked", nextDelayMs: null });
    expect(store["wa_register_blocked"]).toBe("token_invalid");
  });

  it("transient error (network, 5xx, 429): backoff, no attempt counted", async () => {
    for (const reply of ["network", { status: 503, body: {} }, { status: 429, body: {} }] as Reply[]) {
      const { deps, store } = makeDeps(base(), [reply]);
      const r = await processOrg(deps, "org-1");
      expect(r.outcome).toBe("transient_error");
      expect(r.nextDelayMs).toBe(15 * 60e3);
      expect(store["wa_register_attempts"]).toBeUndefined();
    }
  });

  it("register failure counts an attempt, backs off, and gives up at the limit", async () => {
    const failed = { status: 400, body: { error: { type: "OAuthException", code: 133005 } } };
    const first = makeDeps(base(), [unregistered, failed]);
    const r1 = await processOrg(first.deps, "org-1");
    expect(r1.outcome).toBe("register_failed");
    expect(r1.nextDelayMs).toBe(15 * 60e3);
    expect(first.store["wa_register_attempts"]).toBe("1");
    expect(first.store["wa_register_last_result"]).not.toContain("424242");

    const last = makeDeps(base({ wa_register_attempts: String(MAX_ATTEMPTS - 1) }), [unregistered, failed]);
    const r2 = await processOrg(last.deps, "org-1");
    expect(r2).toMatchObject({ outcome: "register_failed", nextDelayMs: null });
    expect(last.store["wa_register_attempts"]).toBe(String(MAX_ATTEMPTS));
  });

  it("register ok but status not yet connected: counts an attempt and re-checks later", async () => {
    const { deps, store } = makeDeps(base(), [unregistered, { status: 200, body: { success: true } }, unregistered]);
    const r = await processOrg(deps, "org-1");
    expect(r.outcome).toBe("registered_not_connected");
    expect(r.nextDelayMs).toBe(15 * 60e3);
    expect(store["wa_register_attempts"]).toBe("1");
  });

  it("does nothing when another worker holds the org lock", async () => {
    const { deps, fetchFn } = makeDeps(base(), []);
    deps.acquireLock = async () => false;
    const r = await processOrg(deps, "org-1");
    expect(r.outcome).toBe("locked");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("selectEligibleOrgIds (database only)", () => {
  it("returns only active, connected, not-done, not-backing-off orgs, capped by limit", async () => {
    const rows = (org: string, kv: Record<string, string>) => Object.entries(kv).map(([key, value]) => ({ organizationId: org, key, value }));
    const prisma = {
      organization: { findMany: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]) },
      vendorSetting: {
        findMany: vi.fn().mockResolvedValue([
          ...rows("a", base()),
          ...rows("b", base({ phone_info_status: "CONNECTED" })),
          ...rows("c", base({ wa_register_done: "true" })),
          ...rows("d", base()),
        ]),
      },
    };
    expect(await selectEligibleOrgIds(prisma, NOW, 20)).toEqual(["a", "d"]);
    expect(await selectEligibleOrgIds(prisma, NOW, 1)).toEqual(["a"]);
    expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "active" } }));
  });

  it("returns an empty list (and makes no further queries) when no org is active", async () => {
    const prisma = { organization: { findMany: vi.fn().mockResolvedValue([]) }, vendorSetting: { findMany: vi.fn() } };
    expect(await selectEligibleOrgIds(prisma, NOW, 20)).toEqual([]);
    expect(prisma.vendorSetting.findMany).not.toHaveBeenCalled();
  });
});
