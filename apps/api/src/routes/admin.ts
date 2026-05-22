import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomBytes } from "crypto";
import { redis } from "../lib/redis.js";
import { writeAdminAudit } from "../lib/audit.js";
import { getClerkUser } from "../lib/clerk-admin.js";

const SENSITIVE_CONFIG_KEYS = new Set([
  "smtp_password", "stripe_secret", "stripe_webhook_secret",
  "razorpay_key_secret", "razorpay_webhook_secret",
]);

function requireSuperAdmin(role: string, reply: FastifyReply): boolean {
  if (role !== "superAdmin") {
    void reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    return false;
  }
  return true;
}

export const adminRouter: FastifyPluginAsync = async (fastify) => {
  // ── Organizations list ───────────────────────────────────────────────────
  fastify.get<{ Querystring: { status?: string; page?: string } }>("/admin/organizations", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const where = request.query.status ? { status: request.query.status } : {};
    const [data, total] = await Promise.all([
      fastify.prisma.organization.findMany({
        where,
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      fastify.prisma.organization.count({ where }),
    ]);
    return reply.send({ data, total, page });
  });

  // ── Ban ──────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/admin/organizations/:id/ban",
    {
      schema: {
        body: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string", minLength: 1, maxLength: 500 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
      if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
      const data = await fastify.prisma.organization.update({
        where: { id: request.params.id },
        data: { status: "banned", banReason: request.body.reason },
      });
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "org.ban",
        targetType: "organization",
        targetId: org.id,
        metadata: { orgName: org.name, reason: request.body.reason },
        request,
      });
      return reply.send({ data });
    }
  );

  // ── Unban ────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/unban", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    const data = await fastify.prisma.organization.update({
      where: { id: request.params.id },
      data: { status: "active", banReason: null },
    });
    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: request.auth.userId,
      action: "org.unban",
      targetType: "organization",
      targetId: org.id,
      metadata: { orgName: org.name },
      request,
    });
    return reply.send({ data });
  });

  // ── Manual subscriptions ─────────────────────────────────────────────────
  fastify.post<{
    Body: {
      organizationId: string;
      planTier: "starter" | "growth" | "scale" | "enterprise";
      charges: number;
      chargesFrequency: string;
      gateway: "stripe" | "razorpay" | "upi" | "bank_transfer" | "cash" | "other";
      durationDays?: number;
    };
  }>(
    "/admin/manual-subscriptions",
    {
      schema: {
        body: {
          type: "object",
          required: ["organizationId", "planTier", "charges", "chargesFrequency", "gateway"],
          properties: {
            organizationId:   { type: "string", minLength: 1 },
            planTier:         { type: "string", enum: ["starter", "growth", "scale", "enterprise"] },
            charges:          { type: "number", minimum: 0 },
            chargesFrequency: { type: "string", minLength: 1, maxLength: 50 },
            gateway:          { type: "string", enum: ["stripe", "razorpay", "upi", "bank_transfer", "cash", "other"] },
            durationDays:     { type: "number", minimum: 1, maximum: 3650 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const endsAt = request.body.durationDays
        ? new Date(Date.now() + request.body.durationDays * 86400000)
        : undefined;
      const data = await fastify.prisma.manualSubscription.create({
        data: {
          organizationId: request.body.organizationId,
          planTier: request.body.planTier,
          charges: request.body.charges,
          chargesFrequency: request.body.chargesFrequency,
          gateway: request.body.gateway,
          status: "active",
          endsAt,
        },
      });
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "subscription.manual_create",
        targetType: "organization",
        targetId: request.body.organizationId,
        metadata: { planTier: request.body.planTier, charges: request.body.charges, gateway: request.body.gateway },
        request,
      });
      return reply.status(201).send({ data });
    }
  );

  // ── Organization detail ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/admin/organizations/:id", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: request.params.id },
      include: { _count: { select: { members: true, conversations: true } } },
    });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    const [contactCount, messageCount, campaignCount] = await Promise.all([
      fastify.prisma.contact.count({ where: { organizationId: org.id } }),
      fastify.prisma.message.count({ where: { organizationId: org.id } }),
      fastify.prisma.campaign.count({ where: { organizationId: org.id } }),
    ]);
    return reply.send({ data: { ...org, usage: { contacts: contactCount, messages: messageCount, campaigns: campaignCount } } });
  });

  // ── Update plan tier / status ────────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { planTier?: string; status?: string; banReason?: string } }>(
    "/admin/organizations/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            planTier:  { type: "string", enum: ["starter", "growth", "scale", "enterprise"] },
            status:    { type: "string", enum: ["active", "inactive", "banned"] },
            banReason: { type: "string", maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
      if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
      const { planTier, status, banReason } = request.body;
      const data = await fastify.prisma.organization.update({
        where: { id: request.params.id },
        data: {
          ...(planTier ? { planTier: planTier as "starter" | "growth" | "scale" | "enterprise" } : {}),
          ...(status ? { status } : {}),
          ...(banReason !== undefined ? { banReason } : {}),
        },
      });
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "org.update",
        targetType: "organization",
        targetId: org.id,
        metadata: { changes: { planTier, status, banReason } },
        request,
      });
      return reply.send({ data });
    }
  );

  // ── Impersonation token ──────────────────────────────────────────────────
  // Token lifetime: 15 min (900s). Rate-limited per actor: 10 tokens/hour.
  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/impersonate", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;

    // Per-actor rate limit: max 10 impersonation tokens per hour
    const actorKey = `impersonate:actor:${request.auth.userId}`;
    const count = await redis.incr(actorKey);
    if (count === 1) await redis.expire(actorKey, 3600);
    if (count > 10) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Impersonation limit reached (10/hour)" } });
    }

    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });

    const token = randomBytes(32).toString("hex");
    // 15 minutes — enough for a support session, short enough to limit blast radius
    await redis.set(
      `impersonate:${token}`,
      JSON.stringify({ organizationId: org.id, orgName: org.name, issuedBy: request.auth.userId }),
      "EX", 900
    );

    await fastify.prisma.impersonationLog.create({
      data: {
        actorId: request.auth.userId,
        organizationId: org.id,
        orgName: org.name,
        token,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
    });

    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: request.auth.userId,
      action: "org.impersonate",
      targetType: "organization",
      targetId: org.id,
      metadata: { orgName: org.name, expiresIn: 900 },
      request,
    });

    return reply.send({ data: { token, expiresIn: 900 } });
  });

  // ── End impersonation ────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string }; Body: { token: string } }>(
    "/admin/organizations/:id/impersonate",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string", minLength: 1 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const { token } = request.body;
      await redis.del(`impersonate:${token}`);
      await fastify.prisma.impersonationLog.updateMany({
        where: { token, endedAt: null },
        data: { endedAt: new Date() },
      });
      return reply.status(204).send();
    }
  );

  // ── Login logs ────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string; userId?: string } }>("/admin/login-logs", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const where = request.query.userId ? { userId: request.query.userId } : {};
    const [logs, total] = await Promise.all([
      fastify.prisma.loginLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      fastify.prisma.loginLog.count({ where }),
    ]);
    return reply.send({ data: logs, total, page });
  });

  // ── Vendor activation ────────────────────────────────────────────────────
  fastify.post<{ Params: { orgId: string } }>("/admin/vendors/:orgId/activate", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.orgId } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    await fastify.prisma.user.updateMany({ where: { organizationId: request.params.orgId }, data: { isActive: true } });
    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: request.auth.userId,
      action: "org.activate",
      targetType: "organization",
      targetId: org.id,
      metadata: { orgName: org.name },
      request,
    });
    return reply.send({ success: true, organizationId: request.params.orgId });
  });

  fastify.post<{ Params: { orgId: string } }>("/admin/vendors/:orgId/deactivate", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.orgId } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    await fastify.prisma.user.updateMany({ where: { organizationId: request.params.orgId }, data: { isActive: false } });
    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: request.auth.userId,
      action: "org.deactivate",
      targetType: "organization",
      targetId: org.id,
      metadata: { orgName: org.name },
      request,
    });
    return reply.send({ success: true, organizationId: request.params.orgId });
  });

  // ── Platform config ──────────────────────────────────────────────────────
  // Sensitive values (secrets, passwords) are masked in GET responses.
  fastify.get("/admin/platform-config", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const rows = await fastify.prisma.platformConfig.findMany({ orderBy: { key: "asc" } });
    const data = rows.map((r) => ({
      ...r,
      value: r.value !== null && SENSITIVE_CONFIG_KEYS.has(r.key) ? "••••••••" : r.value,
    }));
    return reply.send({ data });
  });

  fastify.put<{ Body: { configs: { key: string; value: string; dataType?: string }[] } }>(
    "/admin/platform-config",
    {
      schema: {
        body: {
          type: "object",
          required: ["configs"],
          properties: {
            configs: {
              type: "array",
              maxItems: 50,
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key:      { type: "string", minLength: 1, maxLength: 100 },
                  value:    { type: "string", maxLength: 2000 },
                  dataType: { type: "string", maxLength: 50 },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      // Skip masked placeholder values — don't overwrite real secrets with "••••••••"
      const toSave = request.body.configs.filter((c) => c.value !== "••••••••");
      await Promise.all(
        toSave.map((c) =>
          fastify.prisma.platformConfig.upsert({
            where: { key: c.key },
            create: { key: c.key, value: c.value, dataType: c.dataType ?? "string" },
            update: { value: c.value, dataType: c.dataType ?? "string" },
          })
        )
      );
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "platform_config.update",
        targetType: "platform",
        metadata: { keys: toSave.map((c) => c.key) },
        request,
      });
      return reply.send({ success: true });
    }
  );

  // ── Admin audit log ──────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string; limit?: string; action?: string; actorId?: string } }>(
    "/admin/audit-logs",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "50", 10)));
      const where = {
        ...(request.query.action ? { action: request.query.action } : {}),
        ...(request.query.actorId ? { actorId: request.query.actorId } : {}),
      };
      const [logs, total] = await Promise.all([
        fastify.prisma.adminAuditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        fastify.prisma.adminAuditLog.count({ where }),
      ]);
      return reply.send({ data: logs, total, page });
    }
  );

  // ── Impersonation log ────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string } }>(
    "/admin/impersonation-logs",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const [logs, total] = await Promise.all([
        fastify.prisma.impersonationLog.findMany({
          orderBy: { startedAt: "desc" },
          skip: (page - 1) * 50,
          take: 50,
        }),
        fastify.prisma.impersonationLog.count(),
      ]);
      return reply.send({ data: logs, total, page });
    }
  );

  // ── Org cleanup helpers ──────────────────────────────────────────────────
  async function findGhostOrgs(prisma: typeof fastify.prisma) {
    const orgs = await prisma.organization.findMany({
      where: { id: { not: "platform" } },
      include: { users: { select: { id: true, role: true } } },
    });
    const toDelete: { id: string; name: string; reason: string }[] = [];
    await Promise.all(orgs.map(async (org) => {
      if (org.users.some((u) => u.role === "superAdmin")) return;
      if (org.users.length === 0) {
        toDelete.push({ id: org.id, name: org.name, reason: "no_members" });
        return;
      }
      const checks = await Promise.all(
        org.users.map(async (u) => {
          try { await getClerkUser(u.id); return true; } catch { return false; }
        })
      );
      if (!checks.some(Boolean)) {
        toDelete.push({ id: org.id, name: org.name, reason: "no_valid_clerk_users" });
      }
    }));
    return toDelete;
  }

  // GET  — dry-run preview (no body needed)
  fastify.get("/admin/organizations/cleanup", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const deleted = await findGhostOrgs(fastify.prisma);
    return reply.send({ data: { dryRun: true, deleted } });
  });

  // DELETE — commit deletion (no body needed)
  fastify.delete("/admin/organizations/cleanup", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const toDelete = await findGhostOrgs(fastify.prisma);
    if (toDelete.length > 0) {
      await fastify.prisma.organization.deleteMany({
        where: { id: { in: toDelete.map((o) => o.id) } },
      });
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "org.cleanup",
        targetType: "organization",
        targetId: undefined,
        metadata: { deleted: toDelete.map((o) => o.id), count: toDelete.length },
        request,
      });
    }
    return reply.send({ data: { dryRun: false, deleted: toDelete } });
  });
};
