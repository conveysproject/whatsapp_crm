import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { mobileUpgradeRequired, verifyBearer } from "../auth/identity.js";
import { defaultsForRole, FIXED_PERMISSION_ROLES } from "../lib/default-role-permissions.js";
import { isPlatformOnlyPath } from "../lib/demo-guard.js";
import { redis } from "../lib/redis.js";
import type { AuthContext } from "../types/fastify.js";

type ResolveOptions = {
  /** Impersonation: bypass the cache and require the user to be in this org and not soft-deleted. */
  strictOrganizationId?: string;
};

/**
 * Resolve a user's role, team and effective permissions. Single source of truth
 * for both the normal path and the impersonation path.
 * Returns null when the user does not exist / is inactive.
 */
async function resolveAuthContext(
  fastify: FastifyInstance,
  userId: string,
  opts: ResolveOptions = {}
): Promise<AuthContext | null> {
  const strict = opts.strictOrganizationId !== undefined;
  // Cache auth data to avoid 2 DB round-trips on every request.
  // Invalidated immediately by users routes on role/permission/deactivation changes.
  const AUTH_CACHE_TTL = 60; // seconds — safety net if invalidation is missed
  const cacheKey = `auth:user:${userId}`;
  if (!strict) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { role, organizationId, permissions, teamId, teamRole } = JSON.parse(cached) as Pick<AuthContext, "role" | "organizationId" | "permissions" | "teamId" | "teamRole">;
      return { userId, organizationId, role, permissions, teamId: teamId ?? null, teamRole: teamRole ?? null, sid: null };
    }
  }

  const user = await fastify.prisma.user.findFirst({
    where: strict
      ? { id: userId, organizationId: opts.strictOrganizationId, isActive: true, deletedAt: null }
      : { id: userId, isActive: true },
    select: { role: true, organizationId: true, teamId: true, teamRole: true },
  });
  if (!user) return null;

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
  // Fixed roles ignore the stored row and per-user overrides so they can never be widened.
  const permissions = FIXED_PERMISSION_ROLES.includes(user.role)
    ? defaultsForRole(user.role)
    : { ...roleBaseline, ...memberPermissions };

  if (!strict) {
    await redis.setex(
      cacheKey,
      AUTH_CACHE_TTL,
      JSON.stringify({ role: user.role, organizationId: user.organizationId, permissions, teamId: user.teamId, teamRole: user.teamRole })
    );
  }

  return { userId, organizationId: user.organizationId, role: user.role, permissions, teamId: user.teamId, teamRole: user.teamRole, sid: null };
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const routeConfig = request.routeOptions?.config as unknown as Record<string, unknown> | undefined;
    if (routeConfig?.["public"]) return;

    if (mobileUpgradeRequired(request.headers)) {
      return reply.status(426).send({ error: { code: "UPGRADE_REQUIRED", message: "Please update the WBMSG app to continue." } });
    }

    // GAP-S71: super-admin impersonation via Redis token
    const impersonateToken = request.headers["x-impersonate-token"] as string | undefined;
    if (impersonateToken) {
      const raw = await redis.get(`impersonate:${impersonateToken}`);
      if (!raw) {
        return reply.status(401).send({ error: { code: "INVALID_IMPERSONATION_TOKEN", message: "Invalid or expired impersonation token" } });
      }
      const payload = JSON.parse(raw) as { organizationId?: string; targetUserId?: string; issuedBy?: string; issuedSid?: string | null; mode?: string; isDemo?: boolean };
      // Demo login (POST /demo/login) issues org-scoped tokens with isDemo:true. Preserve that
      // behavior only for such payloads: superAdmin scoped to the demo org, no impersonation
      // context. Every other payload without targetUserId is rejected below.
      if (payload.isDemo === true && !payload.targetUserId && payload.organizationId && payload.issuedBy === undefined) {
        // The demo session is a public, anonymous superAdmin: it must never reach platform admin routes.
        const rawPath = request.url.split("?")[0] ?? "";
        let decodedPath = rawPath;
        try { decodedPath = decodeURIComponent(rawPath); } catch { /* malformed escapes: the raw path is still checked */ }
        if ([rawPath, decodedPath, request.routeOptions?.url ?? ""].some(isPlatformOnlyPath)) {
          return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not available in demo mode" } });
        }
        request.auth = { userId: "demo", organizationId: payload.organizationId, role: "superAdmin", permissions: {}, teamId: null, teamRole: null, sid: null };
        return;
      }
      // Old org-level tokens (no targetUserId) are no longer valid.
      if (!payload.targetUserId || !payload.organizationId || !payload.issuedBy) {
        return reply.status(401).send({ error: { code: "INVALID_IMPERSONATION_TOKEN", message: "Invalid or expired impersonation token" } });
      }
      // The bearer must belong to the super admin who issued the token: a leaked token is useless
      // without that admin's live session.
      try {
        const bearer = await verifyBearer(request.headers.authorization);
        if (bearer.userId !== payload.issuedBy) throw new Error("bearer/issuer mismatch");
        if ((bearer.typ !== "admin" || !payload.issuedSid || bearer.sid !== payload.issuedSid)) {
          throw new Error("bearer session mismatch");
        }
      } catch {
        return reply.status(401).send({ error: { code: "INVALID_IMPERSONATION_TOKEN", message: "Invalid or expired impersonation token" } });
      }
      // Stealth: no lastSignInAt stamp, no presence change on the impersonation path.
      const target = await resolveAuthContext(fastify, payload.targetUserId, { strictOrganizationId: payload.organizationId });
      if (!target || target.role === "superAdmin") {
        return reply.status(401).send({ error: { code: "INVALID_IMPERSONATION_TOKEN", message: "Invalid or expired impersonation token" } });
      }
      request.auth = {
        ...target,
        impersonation: { adminId: payload.issuedBy, mode: payload.mode === "edit" ? "edit" : "readonly" },
      };
      return;
    }

    let userId: string;
    let sid: string | null;
    try {
      ({ userId, sid } = await verifyBearer(request.headers.authorization));
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or missing token" },
      });
    }

    // Stamp lastSignInAt at most once per hour per user — works in local dev
    // without a separate sign-in event.
    const stampKey = `last_sign_in:${userId}`;
    const alreadyStamped = await redis.exists(stampKey);
    if (!alreadyStamped) {
      await redis.setex(stampKey, 3600, "1");
      void fastify.prisma.user.updateMany({
        where: { id: userId },
        data: { lastSignInAt: new Date() },
      }).catch((err: unknown) => fastify.log.warn({ err }, "Failed to stamp lastSignInAt"));
    }

    const auth = await resolveAuthContext(fastify, userId);
    if (!auth) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "User not found in organization" },
      });
    }
    request.auth = { ...auth, sid };
  });
};

export default fp(authPlugin);
