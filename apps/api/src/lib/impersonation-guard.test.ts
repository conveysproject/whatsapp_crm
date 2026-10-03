import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { classifyRoute } from "./impersonation-guard.js";

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

  it("blocks GETs of platform and secret-bearing families", () => {
    expect(classifyRoute("GET", "/v1/admin/organizations")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/admin/super-admins")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/super-admins")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/vendor-settings")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/webhook-actions")).toBe("blocked");
    expect(classifyRoute("GET", "/v1/contacts")).toBe("read-like");
  });

  it("treats unknown writes as unclassified and GET as read-like", () => {
    expect(classifyRoute("POST", "/v1/brand-new")).toBe("unclassified");
    expect(classifyRoute("GET", "/v1/anything")).toBe("read-like");
  });
});

describe("impersonation guard hook", () => {
  async function build(mode: "readonly" | "edit" | null) {
    const guard = (await import("./impersonation-guard.js")).default;
    const app = Fastify({ logger: false });
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
    app.post("/v1/conversations/:id/summarize", ok);
    app.post("/v1/conversations/:id/messages", ok);
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
});
