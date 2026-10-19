import type { FastifyPluginAsync } from "fastify";
import { writeAdminAudit } from "../lib/audit.js";
import { revokeAllSessions } from "../auth/sessions.js";
import { normalizeEmail } from "../auth/ids.js";
import { assertNoUserForEmail, ensureSuperAdminAccount, isUniqueViolation, SuperAdminConflictError } from "../auth/admin-accounts.js";

export const superAdminsRouter: FastifyPluginAsync = async (fastify) => {
  // ── Current super admin identity (used by admin layout server component) ─────
  fastify.get("/admin/super-admins/me", async (request, reply) => {
    if (request.auth.role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    }
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.auth.userId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
    return reply.send({ data: user });
  });

  // ── List all super admins ────────────────────────────────────────────────────
  fastify.get("/admin/super-admins", async (request, reply) => {
    if (request.auth.role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    }

    const admins = await fastify.prisma.user.findMany({
      where: { role: "superAdmin", deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return reply.send({ data: admins });
  });

  // ── Create a new super admin ─────────────────────────────────────────────────
  fastify.post<{
    Body: { email: string; firstName: string; lastName: string };
  }>(
    "/admin/super-admins",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "firstName", "lastName"],
          properties: {
            email:     { type: "string", format: "email" },
            firstName: { type: "string", minLength: 1, maxLength: 100 },
            lastName:  { type: "string", minLength: 1, maxLength: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
      }

      const { firstName, lastName } = request.body;
      const email = normalizeEmail(request.body.email);

      // Prevent duplicate
      const existing = await fastify.prisma.user.findFirst({
        where: { email, role: "superAdmin", deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        return reply.status(409).send({ error: { code: "CONFLICT", message: "A super admin with this email already exists" } });
      }

      // Create the auth account (must set password via Forgot password) and the users row together.
      try {
        const created = await fastify.prisma.$transaction(async (tx) => {
          await assertNoUserForEmail(tx, email);
          const account = await ensureSuperAdminAccount(tx, { email, firstName, lastName });
          const user = await tx.user.create({
            data: {
              id: account.id,
              organizationId: "platform",
              email,
              fullName: `${firstName} ${lastName}`,
              role: "superAdmin",
              isActive: true,
            },
            select: { id: true, email: true, fullName: true, createdAt: true },
          });
          return { ...user, reused: !account.created };
        });
        if (created.reused) {
          await revokeAllSessions(fastify.prisma, created.id, "promoted_to_super_admin").catch(() => undefined);
        }
        writeAdminAudit({
          prisma: fastify.prisma,
          actorId: request.auth.userId,
          action: "superadmin.create",
          targetType: "user",
          targetId: created.id,
          metadata: { email, createdBy: request.auth.userId },
          request,
        });
        fastify.log.info({ userId: created.id, email, actorId: request.auth.userId }, "SuperAdmin created");
        const { reused, ...publicUser } = created;
        void reused; // internal flag, not part of the response
        return reply.status(201).send({ data: { ...publicUser, setPassword: "forgot_password" } });
      } catch (err) {
        if (isUniqueViolation(err) || err instanceof SuperAdminConflictError) {
          return reply.status(409).send({ error: { code: "CONFLICT", message: "A super admin with this email already exists" } });
        }
        fastify.log.error({ err }, "Super admin creation failed");
        return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Failed to create super admin" } });
      }
    }
  );

  // ── Deactivate (soft-delete) a super admin ───────────────────────────────────
  fastify.delete<{ Params: { id: string } }>(
    "/admin/super-admins/:id",
    async (request, reply) => {
      if (request.auth.role !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
      }

      const { id } = request.params;

      // Cannot delete yourself
      if (id === request.auth.userId) {
        return reply.status(400).send({ error: { code: "INVALID_OPERATION", message: "Cannot deactivate your own account" } });
      }

      const target = await fastify.prisma.user.findFirst({
        where: { id, role: "superAdmin", deletedAt: null },
        select: { id: true, email: true },
      });
      if (!target) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Super admin not found" } });
      }

      // Ensure at least one active superAdmin remains
      const activeCount = await fastify.prisma.user.count({
        where: { role: "superAdmin", isActive: true, deletedAt: null },
      });
      if (activeCount <= 1) {
        return reply.status(400).send({ error: { code: "INVALID_OPERATION", message: "Cannot remove the last active super admin" } });
      }

      await fastify.prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });

      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "superadmin.deactivate",
        targetType: "user",
        targetId: id,
        metadata: { email: target.email, deactivatedBy: request.auth.userId },
        request,
      });

      return reply.status(204).send();
    }
  );
};
