import type { FastifyPluginAsync, FastifyReply } from "fastify";

function requireSuperAdmin(role: string, reply: FastifyReply): boolean {
  if (role !== "superAdmin") {
    void reply.status(403).send({ error: "Super admin access required" });
    return false;
  }
  return true;
}

export const adminRouter: FastifyPluginAsync = async (fastify) => {
  // ── Organizations list ───────────────────────────────────────────────────
  fastify.get<{ Querystring: { status?: string; page?: string } }>("/admin/organizations", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const page = parseInt(request.query.page ?? "1", 10);
    const where = request.query.status ? { status: request.query.status } : {};
    const [data, total] = await Promise.all([
      fastify.prisma.organization.findMany({
        where,
        include: { _count: { select: { members: true, contacts: true } } },
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
    // Return org data — frontend uses this to switch context
    return reply.send({ data: { organization: org, impersonating: true } });
  });

  // ── Ban / Unban ──────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/admin/organizations/:id/ban",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const data = await fastify.prisma.organization.update({
        where: { id: request.params.id },
        data: { status: "banned", banReason: request.body.reason },
      });
      return reply.send({ data });
    }
  );

  fastify.post<{ Params: { id: string } }>("/admin/organizations/:id/unban", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const data = await fastify.prisma.organization.update({
      where: { id: request.params.id },
      data: { status: "active", banReason: null },
    });
    return reply.send({ data });
  });

  // ── Manual subscriptions ─────────────────────────────────────────────────
  fastify.post<{
    Body: {
      organizationId: string;
      planTier: string;
      charges: number;
      chargesFrequency: string;
      gateway: string;
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
          planTier: request.body.planTier as "starter" | "growth" | "pro" | "enterprise",
          charges: request.body.charges,
          chargesFrequency: request.body.chargesFrequency,
          gateway: request.body.gateway as "stripe" | "razorpay" | "cashfree" | "payu" | "manual",
          status: "active",
          endsAt,
        },
      });
      return reply.status(201).send({ data });
    }
  );

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
      return reply.send({ success: true });
    }
  );
};
