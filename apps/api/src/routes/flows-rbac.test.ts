// Every flow change needs automation_bot_flows (it was only checked on create, so a Viewer
// with automation_access could edit, delete, duplicate or test-run flows). Reads stay open.
import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

type Fn = ReturnType<typeof vi.fn>;
const model = (): Record<string, Fn> =>
  new Proxy({}, { get: (t: Record<string, Fn>, k: string) => (t[k] ??= vi.fn().mockResolvedValue(k === "findMany" ? [] : null)) });
const mockPrisma = new Proxy({} as Record<string, unknown>, { get: (t, k: string) => (t[k] ??= model()) });

async function build(role: string): Promise<FastifyInstance> {
  const { defaultsForRole } = await import("../lib/default-role-permissions.js");
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "org-1", role: role as "agent", permissions: defaultsForRole(role), teamId: null, teamRole: null };
  });
  const { flowsRouter } = await import("./flows.js");
  await app.register(flowsRouter, { prefix: "/v1" });
  return app;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("flows RBAC", () => {
  it.each([
    ["viewer", "GET", "/v1/flows", true],
    ["viewer", "GET", "/v1/flows/f1/runs", true],
    ["viewer", "POST", "/v1/flows", false],
    ["viewer", "PATCH", "/v1/flows/f1", false],
    ["viewer", "DELETE", "/v1/flows/f1", false],
    ["viewer", "POST", "/v1/flows/f1/duplicate", false],
    ["viewer", "POST", "/v1/flows/f1/test", false],
    ["manager", "DELETE", "/v1/flows/f1", false],
    ["admin", "DELETE", "/v1/flows/f1", true],
    ["admin", "PATCH", "/v1/flows/f1", true],
  ] as const)("%s %s %s → allowed=%s", async (role, method, url, allowed) => {
    const app = await build(role);
    const res = await app.inject({ method, url, payload: method === "GET" || method === "DELETE" ? undefined : { name: "x" } });
    if (allowed) expect(res.statusCode).not.toBe(403);
    else expect(res.statusCode).toBe(403);
    await app.close();
  });
});
