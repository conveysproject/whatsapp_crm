import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomBytes } from "crypto";
import { redis } from "../lib/redis.js";
import { writeAdminAudit } from "../lib/audit.js";

function requireSuperAdmin(role: string, reply: FastifyReply): boolean {
  if (role !== "superAdmin") {
    void reply.status(403).send({ error: "Superadmin access required" });
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

  // ── Organization impersonation ───────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/login-as", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });
    return reply.send({ data: { organization: org, impersonating: true } });
  });

  // ── Ban ──────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/admin/organizations/:id/ban",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
      if (!org) return reply.status(404).send({ error: "Organization not found" });
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
    if (!org) return reply.status(404).send({ error: "Organization not found" });
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
    if (!org) return reply.status(404).send({ error: "Organization not found" });
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
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
      if (!org) return reply.status(404).send({ error: "Organization not found" });
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

  // ── Impersonation token — creates Redis token + logs the session ─────────
  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/impersonate", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });

    const token = randomBytes(32).toString("hex");
    const key = `impersonate:${token}`;
    await redis.set(key, JSON.stringify({ organizationId: org.id, orgName: org.name, issuedBy: request.auth.userId }), "EX", 3600);

    // Persist impersonation session for audit
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
      metadata: { orgName: org.name },
      request,
    });

    return reply.send({ data: { token, expiresIn: 3600 } });
  });

  // ── End impersonation ────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string }; Body: { token: string } }>(
    "/admin/organizations/:id/impersonate",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const { token } = request.body;
      if (token) {
        await redis.del(`impersonate:${token}`);
        // Mark impersonation session as ended
        await fastify.prisma.impersonationLog.updateMany({
          where: { token, endedAt: null },
          data: { endedAt: new Date() },
        });
      }
      return reply.status(204).send();
    }
  );

  // ── Login logs ────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string; userId?: string } }>("/admin/login-logs", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const where = request.query.userId ? { userId: request.query.userId } : {};
    const logs = await fastify.prisma.loginLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
    });
    return reply.send({ data: logs, page });
  });

  // ── Vendor activation ────────────────────────────────────────────────────
  fastify.post<{ Params: { orgId: string } }>("/admin/vendors/:orgId/activate", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.orgId } });
    if (!org) return reply.status(404).send({ error: "Organization not found" });
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
    if (!org) return reply.status(404).send({ error: "Organization not found" });
    await fastify.prisma.user.updateMany({
      where: { organizationId: request.params.orgId },
      data: { isActive: false },
    });
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
  fastify.get("/admin/platform-config", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const data = await fastify.prisma.platformConfig.findMany({ orderBy: { key: "asc" } });
    return reply.send({ data });
  });

  fastify.put<{ Body: { configs: { key: string; value: string; dataType?: string }[] } }>(
    "/admin/platform-config",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      await Promise.all(
        request.body.configs.map((c) =>
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
        metadata: { keys: request.body.configs.map((c) => c.key) },
        request,
      });
      return reply.send({ success: true });
    }
  );

  // ── Admin audit log ──────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string; action?: string; actorId?: string } }>(
    "/admin/audit-logs",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const where = {
        ...(request.query.action ? { action: request.query.action } : {}),
        ...(request.query.actorId ? { actorId: request.query.actorId } : {}),
      };
      const logs = await fastify.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data: logs, page });
    }
  );

  // ── Impersonation log ────────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string } }>(
    "/admin/impersonation-logs",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const logs = await fastify.prisma.impersonationLog.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data: logs, page });
    }
  );
};
