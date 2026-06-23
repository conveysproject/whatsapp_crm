import type { FastifyPluginAsync } from "fastify";
import type { Role } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { defaultsForRole } from "../lib/default-role-permissions.js";

const VALID_ROLES = ["superAdmin", "admin", "manager", "agent", "viewer"] as const;
type RoleKey = (typeof VALID_ROLES)[number];

function settingKey(role: string): string {
  return `role_permissions_${role}`;
}

export const rolesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/roles/permissions", async (request, reply) => {
    const { organizationId, role } = request.auth;
    if (role !== "admin" && role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can view role permissions" } });
    }

    const settings = await fastify.prisma.vendorSetting.findMany({
      where: {
        organizationId,
        key: { in: VALID_ROLES.map(settingKey) },
      },
      select: { key: true, value: true },
    });

    const data = Object.fromEntries(
      VALID_ROLES.map((r) => {
        const row = settings.find((s) => s.key === settingKey(r));
        let permissions: Record<string, string>;
        if (!row) {
          permissions = defaultsForRole(r); // no row → show built-in defaults
        } else {
          try {
            permissions = JSON.parse(row.value ?? "{}") as Record<string, string>;
          } catch {
            permissions = {}; // corrupted stored row
          }
        }
        return [r, permissions];
      })
    ) as Record<RoleKey, Record<string, string>>;

    return reply.send({ data });
  });

  fastify.put<{
    Params: { role: string };
    Body: { permissions: Record<string, string> };
  }>(
    "/roles/:role/permissions",
    {
      schema: {
        params: {
          type: "object",
          properties: { role: { type: "string" } },
          required: ["role"],
        },
        body: {
          type: "object",
          properties: { permissions: { type: "object", additionalProperties: { type: "string" } } },
          required: ["permissions"],
        },
      },
    },
    async (request, reply) => {
      const { organizationId, role: authRole } = request.auth;
      if (authRole !== "admin" && authRole !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can update role permissions" } });
      }

      if (!(VALID_ROLES as readonly string[]).includes(request.params.role)) {
        return reply.status(400).send({ error: { code: "INVALID_ROLE", message: `Role must be one of: ${VALID_ROLES.join(", ")}` } });
      }

      const key = settingKey(request.params.role);
      const value = JSON.stringify(request.body.permissions);

      await fastify.prisma.vendorSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: { organizationId, key, value },
        update: { value },
      });

      const affected = await fastify.prisma.user.findMany({
        where: { organizationId, role: request.params.role as Role },
        select: { id: true },
      });
      if (affected.length > 0) {
        await redis.del(...affected.map((u) => `auth:user:${u.id}`));
      }

      return reply.send({ data: { role: request.params.role, permissions: request.body.permissions } });
    }
  );
};
