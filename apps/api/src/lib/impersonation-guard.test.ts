import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { classifyRoute, isSecretRead } from "./impersonation-guard.js";

vi.mock("./redis.js", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(), exists: vi.fn(), setex: vi.fn() },
}));

describe("impersonation route classification", () => {
  it("classifies every registered non-GET route (new routes must be added to the lists)", async () => {
    const app = Fastify({ logger: false });
    const found: { method: string; url: string; public: boolean }[] = [];
    app.addHook("onRoute", (r) => {
      const methods = Array.isArray(r.method) ? r.method : [r.method];
      for (const method of methods) {
        found.push({ method, url: r.url, public: Boolean((r.config as { public?: boolean } | undefined)?.public) });
      }
    });
    const { routes } = await import("../routes/index.js");
    await app.register(routes);
    await app.close();

    expect(found.length).toBeGreaterThan(100);
    const unclassified = found
      // Public routes skip the auth plugin entirely, so no impersonation context can exist.
      .filter((r) => !r.public)
      .filter((r) => classifyRoute(r.method, r.url) === "unclassified")
      .map((r) => `${r.method} ${r.url}`);
    expect(unclassified).toEqual([]);
  }, 60000);

  it("blocks all DELETE and the block-listed families", () => {
    expect(classifyRoute("DELETE", "/v1/contacts/:id")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/campaigns/:id/schedule")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/billing/switch-plan")).toBe("blocked");
    expect(classifyRoute("PUT", "/v1/users/:id/permissions")).toBe("blocked");
    expect(classifyRoute("PUT", "/v1/roles/:role/permissions")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/whatsapp-account/connect-manual")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/webhook-endpoints/:id/rotate-secret")).toBe("blocked");
  });

  it("blocks GETs of platform families; secret-bearing tenant GETs are readable (and audited)", () => {
    expect(classifyRoute("GET", "/v1/admin/organizations")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/admin/super-admins")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/super-admins")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/vendor-settings")).toBe("read-like");
    expect(classifyRoute("GET", "/v1/webhook-actions")).toBe("read-like");
    expect(classifyRoute("GET", "/v1/contacts")).toBe("read-like");
  });

  it("allows Meta cache-refresh syncs under the blocked whatsapp-account family, nothing else there", () => {
    expect(classifyRoute("POST", "/v1/whatsapp-account/sync-all")).toBe("read-like");
    expect(classifyRoute("POST", "/v1/whatsapp-account/sync-phone-numbers")).toBe("read-like");
    // credentials / connection / Meta-side changes stay blocked
    expect(classifyRoute("POST", "/v1/whatsapp-account/connect")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/whatsapp-account/connect-manual")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/whatsapp-account/disconnect-account")).toBe("blocked");
    expect(classifyRoute("POST", "/v1/whatsapp-account/register-phone")).toBe("blocked");
    expect(classifyRoute("PUT", "/v1/whatsapp-account/two-step-verification")).toBe("blocked");
    expect(classifyRoute("PUT", "/v1/whatsapp-account/business-profile")).toBe("blocked");
    // an exception never makes a DELETE or a different method readable
    expect(classifyRoute("DELETE", "/v1/whatsapp-account/sync-all")).toBe("blocked");
    expect(classifyRoute("PUT", "/v1/whatsapp-account/sync-all")).toBe("blocked");
  });

  it("flags secret-bearing GET routes for audit", () => {
    expect(isSecretRead("GET", "/v1/vendor-settings")).toBe(true);
    expect(isSecretRead("GET", "/v1/vendor-settings/marketing-messages/status")).toBe(true);
    expect(isSecretRead("GET", "/v1/webhook-actions/:id/logs")).toBe(true);
    expect(isSecretRead("HEAD", "/v1/vendor-settings")).toBe(true);
    expect(isSecretRead("PUT", "/v1/vendor-settings")).toBe(false);
    expect(isSecretRead("GET", "/v1/contacts")).toBe(false);
    expect(isSecretRead("GET", "/v1/vendor-settingsx")).toBe(false);
  });

  it("blocks automation-rule routes in every mode", () => {
    for (const k of [
      ["POST", "/v1/auto-replies"],
      ["PATCH", "/v1/auto-replies/:id"],
      ["PUT", "/v1/automation/settings/ooo"],
      ["PUT", "/v1/automation/settings/welcome"],
      ["PUT", "/v1/automation/settings/delayed"],
    ] as const) {
      expect(classifyRoute(k[0], k[1])).toBe("blocked");
    }
  });

  it("treats unknown writes as unclassified and GET as read-like", () => {
    expect(classifyRoute("POST", "/v1/brand-new")).toBe("unclassified");
    expect(classifyRoute("GET", "/v1/anything")).toBe("read-like");
  });
});

describe("impersonation guard hook", () => {
  const handlerSpy = vi.fn();
  async function build(mode: "readonly" | "edit" | null, auditCreate: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({})) {
    const guard = (await import("./impersonation-guard.js")).default;
    const app = Fastify({ logger: false });
    app.decorate("prisma", { adminAuditLog: { create: auditCreate } } as never);
    app.addHook("preHandler", async (req) => {
      req.auth = {
        userId: "u", organizationId: "o", role: "agent", permissions: {}, teamId: null, teamRole: null,
        ...(mode ? { impersonation: { adminId: "sa", mode } } : {}),
      };
    });
    await app.register(guard);
    const ok = async () => ({ ok: true });
    app.get("/v1/contacts", ok);
    app.get("/v1/admin/organizations", ok);
    app.get("/v1/vendor-settings", async () => ({ data: { whatsapp_access_token: "SECRET" } }));
    app.post("/v1/whatsapp-account/sync-all", ok);
    app.post("/v1/whatsapp-account/disconnect-account", ok);
    app.get("/v1/webhook-actions", async () => { handlerSpy(); return { ok: true }; });
    app.post("/v1/conversations/:id/summarize", ok);
    app.post("/v1/conversations/:id/messages", ok);
    app.post("/v1/conversations/:id/read", ok);
    app.post("/v1/conversations/:id/typing", ok);
    app.post("/v1/conversations/:id/assign", ok);
    app.post("/v1/conversations/:id/status", ok);
    app.post("/v1/campaigns", ok);
    app.delete("/v1/contacts/:id", ok);
    app.post("/v1/brand-new", ok);
    await app.ready();
    return app;
  }
  const code = (r: { json: () => unknown }) => (r.json() as { error: { code: string } }).error.code;

  it("read-only: GET and read-like POST pass, edit writes are 403 IMPERSONATION_READ_ONLY", async () => {
    const app = await build("readonly");
    expect((await app.inject({ method: "GET", url: "/v1/contacts" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/conversations/1/summarize" })).statusCode).toBe(200);
    const res = await app.inject({ method: "POST", url: "/v1/conversations/1/messages" });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe("IMPERSONATION_READ_ONLY");
    await app.close();
  });

  it("secret-bearing GET is allowed in readonly mode and writes an audit entry without the value", async () => {
    const audit = vi.fn().mockResolvedValue({});
    const app = await build("readonly", audit);
    const res = await app.inject({ method: "GET", url: "/v1/vendor-settings" });
    expect(res.statusCode).toBe(200);
    expect(audit).toHaveBeenCalledTimes(1);
    const arg = audit.mock.calls[0]![0] as { data: { action: string; actorId: string; metadata: Record<string, unknown> } };
    expect(arg.data.action).toBe("impersonation.secret_read");
    expect(arg.data.actorId).toBe("sa");
    expect(arg.data.metadata).toMatchObject({ route: "/v1/vendor-settings", organizationId: "o" });
    expect(JSON.stringify(arg)).not.toContain("SECRET");
    await app.close();
  });

  it("secret-bearing GET is refused with 503 when the audit write fails (fail-closed)", async () => {
    const audit = vi.fn().mockRejectedValue(new Error("db down"));
    const app = await build("readonly", audit);
    const res = await app.inject({ method: "GET", url: "/v1/webhook-actions" });
    expect(res.statusCode).toBe(503);
    expect(code(res)).toBe("AUDIT_UNAVAILABLE");
    expect(handlerSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it("ordinary GETs and non-impersonated secret GETs are not audited", async () => {
    const audit = vi.fn().mockResolvedValue({});
    const imp = await build("readonly", audit);
    expect((await imp.inject({ method: "GET", url: "/v1/contacts" })).statusCode).toBe(200);
    await imp.close();
    const normal = await build(null, audit);
    expect((await normal.inject({ method: "GET", url: "/v1/vendor-settings" })).statusCode).toBe(200);
    await normal.close();
    expect(audit).not.toHaveBeenCalled();
  });

  it("read-only: sync-all passes (no audit), disconnect-account is still blocked", async () => {
    const audit = vi.fn().mockResolvedValue({});
    const app = await build("readonly", audit);
    expect((await app.inject({ method: "POST", url: "/v1/whatsapp-account/sync-all" })).statusCode).toBe(200);
    const res = await app.inject({ method: "POST", url: "/v1/whatsapp-account/disconnect-account" });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe("IMPERSONATION_BLOCKED");
    expect(audit).not.toHaveBeenCalled();
    await app.close();
  });

  it("GET under /v1/admin is IMPERSONATION_BLOCKED for impersonated sessions", async () => {
    const app = await build("edit");
    const res = await app.inject({ method: "GET", url: "/v1/admin/organizations" });
    expect(res.statusCode).toBe(403);
    expect(code(res)).toBe("IMPERSONATION_BLOCKED");
    await app.close();
  });

  it("read-only: block-listed, DELETE and unclassified are IMPERSONATION_BLOCKED", async () => {
    const app = await build("readonly");
    for (const [method, url] of [["POST", "/v1/campaigns"], ["DELETE", "/v1/contacts/1"], ["POST", "/v1/brand-new"]] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(403);
      expect(code(res)).toBe("IMPERSONATION_BLOCKED");
    }
    await app.close();
  });

  it("edit mode: edit writes pass but block list and unclassified still 403", async () => {
    const app = await build("edit");
    expect((await app.inject({ method: "POST", url: "/v1/conversations/1/messages" })).statusCode).toBe(200);
    for (const [method, url] of [["POST", "/v1/campaigns"], ["DELETE", "/v1/contacts/1"], ["POST", "/v1/brand-new"]] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(403);
      expect(code(res)).toBe("IMPERSONATION_BLOCKED");
    }
    await app.close();
  });

  it("does nothing for normal (non-impersonated) requests", async () => {
    const app = await build(null);
    expect((await app.inject({ method: "DELETE", url: "/v1/contacts/1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/campaigns" })).statusCode).toBe(200);
    await app.close();
  });

  it("side-effect routes: read/typing are silent no-ops (204 read-only; handlers no-op in edit), assign/status always blocked", async () => {
    const ro = await build("readonly");
    for (const a of ["read", "typing"]) {
      // 204 no-op in read-only too, so the inbox does not error; handler never runs.
      const res = await ro.inject({ method: "POST", url: `/v1/conversations/${a === "read" ? "1" : "1"}/${a}` });
      expect(res.statusCode).toBe(204);
    }
    await ro.close();
    const ed = await build("edit");
    for (const a of ["read", "typing"]) {
      expect((await ed.inject({ method: "POST", url: `/v1/conversations/1/${a}` })).statusCode).toBe(200);
    }
    for (const a of ["assign", "status"]) {
      const res = await ed.inject({ method: "POST", url: `/v1/conversations/1/${a}` });
      expect(res.statusCode).toBe(403);
      expect(code(res)).toBe("IMPERSONATION_BLOCKED");
    }
    await ed.close();
  });

  it("edit mode: a write that passes the guard is audited (actor admin, target user, method+route)", async () => {
    const guard = (await import("./impersonation-guard.js")).default;
    const create = vi.fn().mockResolvedValue({});
    const app = Fastify({ logger: false });
    app.decorate("prisma", { adminAuditLog: { create } } as never);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "target-1", organizationId: "o", role: "agent", permissions: {}, teamId: null, teamRole: null, impersonation: { adminId: "sa", mode: "edit" } };
    });
    await app.register(guard);
    app.post("/v1/conversations/:id/messages", async () => ({ ok: true }));
    app.post("/v1/campaigns", async () => ({ ok: true }));
    app.get("/v1/contacts", async () => ({ ok: true }));
    await app.ready();
    await app.inject({ method: "POST", url: "/v1/conversations/abc/messages", payload: { text: "secret body" } });
    await app.inject({ method: "POST", url: "/v1/campaigns" }); // blocked: not audited here
    await app.inject({ method: "GET", url: "/v1/contacts" }); // reads: not audited
    await new Promise((r) => setImmediate(r));
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorId: "sa", action: "impersonation.request", targetType: "user", targetId: "target-1" });
    expect(data.metadata).toEqual({ method: "POST", route: "/v1/conversations/:id/messages", organizationId: "o" });
    expect(JSON.stringify(data)).not.toContain("secret body");
    await app.close();
  });

  it("edit mode: audit is fail-closed (503 AUDIT_UNAVAILABLE, handler never runs)", async () => {
    const guard = (await import("./impersonation-guard.js")).default;
    const create = vi.fn().mockRejectedValue(new Error("db down"));
    const handler = vi.fn(async () => ({ ok: true }));
    const app = Fastify({ logger: false });
    app.decorate("prisma", { adminAuditLog: { create } } as never);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "t", organizationId: "o", role: "agent", permissions: {}, teamId: null, teamRole: null, impersonation: { adminId: "sa", mode: "edit" } };
    });
    await app.register(guard);
    app.post("/v1/conversations/:id/messages", handler);
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/v1/conversations/1/messages" });
    expect(res.statusCode).toBe(503);
    expect(code(res)).toBe("AUDIT_UNAVAILABLE");
    expect(handler).not.toHaveBeenCalled();
    await app.close();
  });

  it("automation / bulk-send adjacent routes are blocked in every mode", () => {
    for (const [m, u] of [
      ["POST", "/v1/flows/:id/test"], ["PATCH", "/v1/flows/:id"], ["POST", "/v1/chatbots/:id/activate"],
      ["PATCH", "/v1/chatbots/:id"], ["POST", "/v1/templates/:id/send-to-contact"], ["POST", "/v1/contacts/import/start"],
    ] as const) {
      expect(classifyRoute(m, u)).toBe("blocked");
    }
    // harmless data edit, intentionally left edit-class
    expect(classifyRoute("POST", "/v1/contact-groups/build")).toBe("edit");
  });
});
