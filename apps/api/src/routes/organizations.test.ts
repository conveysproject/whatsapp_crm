import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { Organization } from "@prisma/client";

const mockOrg = {
  id: "org_123",
  name: "Acme Corp",
  planTier: "starter",
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(mockOrg),
      update: vi.fn().mockResolvedValue({ ...mockOrg, name: "Updated Corp" }),
    },
    $disconnect: vi.fn(),
  },
}));

describe("organizations routes", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("../plugins/prisma.js")).default;
    const { organizationRoutes } = await import("./organizations.js");
    await app.register(prismaPlugin);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_123", organizationId: "org_123", role: "admin", permissions: {} };
    });
    await app.register(organizationRoutes, { prefix: "/v1" });
    await app.ready();
  });

  afterAll(() => app.close());

  it("GET /v1/organizations/me returns current org", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/organizations/me" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { id: string } }).data.id).toBe("org_123");
  });

  it("PATCH /v1/organizations/me updates org name", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/organizations/me",
      payload: { name: "Updated Corp" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { name: string } }).data.name).toBe("Updated Corp");
  });
});

describe("POST /v1/organizations/branding/logo", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("../plugins/prisma.js")).default;
    const { organizationRoutes } = await import("./organizations.js");
    await app.register(prismaPlugin);
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_123", organizationId: "org_123", role: "admin", permissions: {} };
    });
    await app.register(organizationRoutes, { prefix: "/v1" });
    await app.ready();
  });

  afterAll(() => app.close());

  it("updates org logoImage field with provided URL", async () => {
    const { prisma } = await import("../lib/prisma.js");
    vi.mocked(prisma.organization.update).mockResolvedValueOnce({
      id: "org_123",
      logoImage: "https://cdn.example.com/logo.png",
    } as unknown as Organization);

    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations/branding/logo",
      payload: { url: "https://cdn.example.com/logo.png" },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { logoImage: "https://cdn.example.com/logo.png" } })
    );
  });
});
