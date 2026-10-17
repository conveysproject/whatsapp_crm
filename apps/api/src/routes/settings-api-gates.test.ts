// RBAC for the settings APIs that used to have no permission check
// (docs/prd-whatsapp-admin-role.md, "fix all gaps" 2026-10-17). Every role uses its built-in defaults.
import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/r2.js", () => ({ uploadToR2: vi.fn(), deleteFromR2: vi.fn(), R2_PUBLIC_URL: "https://r2" }));

// Every model method resolves to "nothing found" so a passing gate ends in 200/404, never a crash.
const model = (): Record<string, ReturnType<typeof vi.fn>> =>
  new Proxy({}, { get: (t: Record<string, ReturnType<typeof vi.fn>>, k: string) => (t[k] ??= vi.fn().mockResolvedValue(k === "findMany" ? [] : null)) });
const mockPrisma = new Proxy({} as Record<string, unknown>, {
  get: (t, k: string) => (t[k] ??= k === "$transaction" ? vi.fn((ops: unknown[]) => Promise.all(ops)) : model()),
});

async function build(router: FastifyPluginAsync, role: string): Promise<FastifyInstance> {
  const { defaultsForRole } = await import("../lib/default-role-permissions.js");
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "org-1", role: role as "agent", permissions: defaultsForRole(role), teamId: null, teamRole: null };
  });
  await app.register(router, { prefix: "/v1" });
  return app;
}

type Case = [role: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, allowed: boolean];

async function check(router: () => Promise<FastifyPluginAsync>, [role, method, url, allowed]: Case): Promise<void> {
  const app = await build(await router(), role);
  const res = await app.inject({ method, url, payload: method === "GET" || method === "DELETE" ? undefined : { name: "x", title: "x" } });
  if (allowed) expect(res.statusCode).not.toBe(403);
  else expect(res.statusCode).toBe(403);
  await app.close();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("conversation labels: inbox users label, settings_tags deletes", () => {
  const router = async () => (await import("./inbox-labels.js")).inboxLabelsRouter;
  it.each<Case>([
    ["agent", "GET", "/v1/inbox-labels", true],
    ["agent", "PUT", "/v1/conversations/c1/label", true],
    ["agent", "DELETE", "/v1/conversations/c1/label", true],
    ["agent", "DELETE", "/v1/inbox-labels/l1", false],
    ["manager", "DELETE", "/v1/inbox-labels/l1", true],
    ["whatsappAdmin", "GET", "/v1/inbox-labels", false],
    ["whatsappAdmin", "PUT", "/v1/conversations/c1/label", false],
  ])("%s %s %s → allowed=%s", async (...c) => check(router, c));
});

describe("media library: senders browse/upload, settings users rename/delete", () => {
  const router = async () => (await import("./media-assets.js")).mediaAssetsRouter;
  it.each<Case>([
    ["agent", "GET", "/v1/media-assets", true],
    ["agent", "POST", "/v1/media-assets", true],
    ["agent", "POST", "/v1/media-assets/upload", true],
    ["agent", "PUT", "/v1/media-assets/m1", false],
    ["agent", "DELETE", "/v1/media-assets/m1", false],
    ["manager", "PUT", "/v1/media-assets/m1", true],
    ["manager", "DELETE", "/v1/media-assets/m1", true],
    ["whatsappAdmin", "GET", "/v1/media-assets", false],
    ["whatsappAdmin", "POST", "/v1/media-assets/upload", false],
  ])("%s %s %s → allowed=%s", async (...c) => check(router, c));
});

describe("webhook actions: automation_access", () => {
  const router = async () => (await import("./webhook-actions.js")).webhookActionsRouter;
  it.each<Case>([
    ["manager", "GET", "/v1/webhook-actions", true],
    ["manager", "POST", "/v1/webhook-actions", true],
    ["agent", "GET", "/v1/webhook-actions", false],
    ["agent", "POST", "/v1/webhook-actions", false],
    ["agent", "DELETE", "/v1/webhook-actions/w1", false],
    ["whatsappAdmin", "GET", "/v1/webhook-actions", false],
  ])("%s %s %s → allowed=%s", async (...c) => check(router, c));
});

describe("routing rules: settings_teams", () => {
  const router = async () => (await import("./routing.js")).routingRouter;
  it.each<Case>([
    ["manager", "GET", "/v1/routing-rules", true],
    ["manager", "DELETE", "/v1/routing-rules/r1", true],
    ["agent", "GET", "/v1/routing-rules", false],
    ["agent", "POST", "/v1/routing-rules", false],
    ["viewer", "PATCH", "/v1/routing-rules/r1", false],
    ["whatsappAdmin", "GET", "/v1/routing-rules", false],
  ])("%s %s %s → allowed=%s", async (...c) => check(router, c));
});
