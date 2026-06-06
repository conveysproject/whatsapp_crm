import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";
import { redis } from "../lib/redis.js";
import type { AuthContext } from "../types/fastify.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const routeConfig = request.routeOptions?.config as unknown as Record<string, unknown> | undefined;
    if (routeConfig?.["public"]) return;

    // GAP-S71: super-admin impersonation via Redis token
    const impersonateToken = request.headers["x-impersonate-token"] as string | undefined;
    if (impersonateToken) {
      const raw = await redis.get(`impersonate:${impersonateToken}`);
      if (!raw) {
        return reply.status(401).send({ error: { code: "INVALID_IMPERSONATION_TOKEN", message: "Invalid or expired impersonation token" } });
      }
      const { organizationId, issuedBy } = JSON.parse(raw) as { organizationId: string; issuedBy: string };
      request.auth = { userId: issuedBy, organizationId, role: "superAdmin", permissions: {} };
      return;
    }

    let userId: string;
    try {
      ({ userId } = await verifyClerkToken(request.headers.authorization));
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or missing token" },
      });
    }

    // Cache auth data to avoid 2 DB round-trips on every request.
    // Invalidated immediately by users routes on role/permission/deactivation changes.
    const AUTH_CACHE_TTL = 60; // seconds — safety net if invalidation is missed
    const cacheKey = `auth:user:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { role, organizationId, permissions } = JSON.parse(cached) as Pick<AuthContext, "role" | "organizationId" | "permissions">;
      request.auth = { userId, organizationId, role, permissions };
      return;
    }

    const user = await fastify.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { role: true, organizationId: true },
    });

    if (!user) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "User not found in organization" },
      });
    }

    const member = await fastify.prisma.organizationMember.findFirst({
      where: { userId, organizationId: user.organizationId },
      select: { permissions: true },
    });

    const roleSettingRow = await fastify.prisma.vendorSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: user.organizationId,
          key: `role_permissions_${user.role}`,
        },
      },
      select: { value: true },
    });
    let roleDefaults: Record<string, string> = {};
    if (roleSettingRow?.value) {
      try { roleDefaults = JSON.parse(roleSettingRow.value) as Record<string, string>; } catch { /* corrupted row — treat as empty */ }
    }
    const memberPermissions = (member?.permissions ?? {}) as Record<string, string>;
    const permissions = { ...roleDefaults, ...memberPermissions };

    await redis.setex(
      cacheKey,
      AUTH_CACHE_TTL,
      JSON.stringify({ role: user.role, organizationId: user.organizationId, permissions })
    );

    request.auth = { userId, organizationId: user.organizationId, role: user.role, permissions };
  });
};

export default fp(authPlugin);
