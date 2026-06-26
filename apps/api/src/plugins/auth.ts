import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";
import { defaultsForRole } from "../lib/default-role-permissions.js";
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
      request.auth = { userId: issuedBy, organizationId, role: "superAdmin", permissions: {}, teamId: null, teamRole: null };
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

    // Stamp lastSignInAt at most once per hour per user — works in local dev
    // without relying on Clerk webhooks reaching localhost.
    const stampKey = `last_sign_in:${userId}`;
    const alreadyStamped = await redis.exists(stampKey);
    if (!alreadyStamped) {
      await redis.setex(stampKey, 3600, "1");
      void fastify.prisma.user.updateMany({
        where: { id: userId },
        data: { lastSignInAt: new Date() },
      }).catch((err: unknown) => fastify.log.warn({ err }, "Failed to stamp lastSignInAt"));
    }

    // Cache auth data to avoid 2 DB round-trips on every request.
    // Invalidated immediately by users routes on role/permission/deactivation changes.
    const AUTH_CACHE_TTL = 60; // seconds — safety net if invalidation is missed
    const cacheKey = `auth:user:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { role, organizationId, permissions, teamId, teamRole } = JSON.parse(cached) as Pick<AuthContext, "role" | "organizationId" | "permissions" | "teamId" | "teamRole">;
      request.auth = { userId, organizationId, role, permissions, teamId: teamId ?? null, teamRole: teamRole ?? null };
      return;
    }

    const user = await fastify.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { role: true, organizationId: true, teamId: true, teamRole: true },
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
    // Row PRESENT → use exactly what's stored (even {} = deny all).
    // Row ABSENT → fall back to built-in role defaults.
    let roleBaseline: Record<string, string>;
    if (roleSettingRow === null) {
      roleBaseline = defaultsForRole(user.role);
    } else {
      try {
        roleBaseline = JSON.parse(roleSettingRow.value ?? "{}") as Record<string, string>;
      } catch {
        roleBaseline = {}; // row exists but corrupted — intentional write, treat as deny-all
      }
    }
    const memberPermissions = (member?.permissions ?? {}) as Record<string, string>;
    const permissions = { ...roleBaseline, ...memberPermissions };

    await redis.setex(
      cacheKey,
      AUTH_CACHE_TTL,
      JSON.stringify({ role: user.role, organizationId: user.organizationId, permissions, teamId: user.teamId, teamRole: user.teamRole })
    );

    request.auth = { userId, organizationId: user.organizationId, role: user.role, permissions, teamId: user.teamId, teamRole: user.teamRole };
  });
};

export default fp(authPlugin);
