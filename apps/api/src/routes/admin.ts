import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { randomBytes } from "crypto";
import { redis } from "../lib/redis.js";
import { writeAdminAudit } from "../lib/audit.js";
import { getClerkUser } from "../lib/clerk-admin.js";
import { sendMail, isEmailConfigured } from "../lib/mail.js";

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
        include: { _count: { select: { users: { where: { isActive: true, deletedAt: null } } } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      }),
      fastify.prisma.organization.count({ where }),
    ]);
    // Members = active, non-deleted users (OrganizationMember only holds permission overrides)
    const rows = data.map(({ _count, ...org }) => ({ ...org, _count: { members: _count.users } }));
    return reply.send({ data: rows, total, page });
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
      include: { _count: { select: { users: { where: { isActive: true, deletedAt: null } }, conversations: true } } },
    });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    const [contactCount, messageCount, campaignCount] = await Promise.all([
      fastify.prisma.contact.count({ where: { organizationId: org.id } }),
      fastify.prisma.message.count({ where: { organizationId: org.id } }),
      fastify.prisma.campaign.count({ where: { organizationId: org.id } }),
    ]);
    const { _count, ...orgFields } = org;
    return reply.send({
      data: {
        ...orgFields,
        _count: { members: _count.users, conversations: _count.conversations },
        usage: { contacts: contactCount, messages: messageCount, campaigns: campaignCount },
      },
    });
  });

  // ── Organization users (for "Login As" picker) ───────────────────────────
  fastify.get<{ Params: { id: string } }>("/admin/organizations/:id/users", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const org = await fastify.prisma.organization.findUnique({ where: { id: request.params.id } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    const data = await fastify.prisma.user.findMany({
      where: { organizationId: org.id, deletedAt: null, role: { not: "superAdmin" } },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, lastSignInAt: true },
      orderBy: { fullName: "asc" },
    });
    return reply.send({ data });
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

  // ── Impersonation token (user-level) ─────────────────────────────────────
  // Token lifetime: 15 min (900s). Rate-limited per actor: 10 tokens/hour.
  // Sessions start read-only; the read-only guard enforces it on every request.
  fastify.post<{ Params: { orgId: string; userId: string } }>(
    "/admin/organizations/:orgId/users/:userId/impersonate",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;

      // Per-actor rate limit: max 10 impersonation tokens per hour
      const actorKey = `impersonate:actor:${request.auth.userId}`;
      const count = await redis.incr(actorKey);
      if (count === 1) await redis.expire(actorKey, 3600);
      if (count > 10) {
        return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Impersonation limit reached (10/hour)" } });
      }

      const { orgId, userId } = request.params;
      const org = await fastify.prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });

      // Org scoping: the target must belong to :orgId, be active and not soft-deleted.
      const target = await fastify.prisma.user.findFirst({
        where: { id: userId, organizationId: org.id, isActive: true, deletedAt: null },
        select: { id: true, role: true, fullName: true },
      });
      if (!target) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found in this organization" } });
      if (target.role === "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admins cannot be impersonated" } });
      }

      const token = randomBytes(32).toString("hex");
      // Log FIRST: if the log row cannot be written, no token is ever created (no unlogged session).
      await fastify.prisma.impersonationLog.create({
        data: {
          actorId: request.auth.userId,
          organizationId: org.id,
          orgName: org.name,
          targetUserId: target.id,
          mode: "readonly",
          token,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
      });
      // 15 minutes — enough for a support session, short enough to limit blast radius
      await redis.set(
        `impersonate:${token}`,
        JSON.stringify({ organizationId: org.id, targetUserId: target.id, issuedBy: request.auth.userId, mode: "readonly" }),
        "EX", 900
      );

      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "user.impersonate",
        targetType: "user",
        targetId: target.id,
        metadata: { organizationId: org.id, orgName: org.name, targetRole: target.role, mode: "readonly", expiresIn: 900 },
        request,
      });

      return reply.send({ data: { token, expiresIn: 900, mode: "readonly" } });
    }
  );

  // ── Elevate an impersonation session to edit mode ─────────────────────────
  // Only the issuing real super admin (own Clerk token, never an impersonation session).
  // The remaining TTL is preserved: elevation never extends the session.
  fastify.post<{ Body: { token: string; reason: string } }>(
    "/admin/impersonation/elevate",
    {
      schema: {
        body: {
          type: "object",
          required: ["token", "reason"],
          properties: {
            token: { type: "string", minLength: 1 },
            reason: { type: "string", minLength: 10, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      if (request.auth.impersonation) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not available during impersonation" } });
      }
      const { token, reason } = request.body;
      const adminId = request.auth.userId;
      const key = `impersonate:${token}`;
      const notFound = () => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Impersonation session not found or expired" } });

      const raw = await redis.get(key);
      let payload: { organizationId?: string; targetUserId?: string; issuedBy?: string; mode?: string } | null = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (!payload || !payload.targetUserId || !payload.organizationId) return notFound();
      if (payload.issuedBy !== adminId) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only the issuing admin can elevate this session" } });
      }
      if (payload.mode === "edit") {
        return reply.status(409).send({ error: { code: "ALREADY_ELEVATED", message: "Session is already in edit mode" } });
      }
      const ttlMs = await redis.pttl(key);
      if (ttlMs <= 0) return notFound();

      const logged = await fastify.prisma.impersonationLog.updateMany({
        where: { token, actorId: adminId, endedAt: null },
        data: { mode: "edit", elevationReason: reason },
      });
      // No matching open log row (ended/unknown): refuse, never create an unlogged edit session.
      if (logged.count === 0) return notFound();

      // PX with the remaining TTL: no extension. Log first so a log failure never leaves an unlogged edit session.
      await redis.set(key, JSON.stringify({ ...payload, mode: "edit" }), "PX", ttlMs);

      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: adminId,
        action: "user.impersonate.elevate",
        targetType: "user",
        targetId: payload.targetUserId,
        metadata: { organizationId: payload.organizationId, reason, remainingMs: ttlMs },
        request,
      });

      void notifyOtherSuperAdmins(adminId, payload.targetUserId, payload.organizationId, reason);

      return reply.send({ data: { mode: "edit", expiresIn: Math.ceil(ttlMs / 1000) } });
    }
  );

  // Platform-side only: other super admins are told by email. Never the tenant. Best effort.
  async function notifyOtherSuperAdmins(actorId: string, targetUserId: string, orgId: string, reason: string) {
    try {
      if (!isEmailConfigured()) {
        fastify.log.warn("Impersonation elevation email skipped: email is not configured");
        return;
      }
      const others = await fastify.prisma.user.findMany({
        where: { role: "superAdmin", id: { not: actorId }, isActive: true, deletedAt: null },
        select: { email: true },
      });
      const to = others.map((u) => u.email).filter(Boolean);
      if (to.length === 0) return;
      const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      await sendMail({
        to,
        subject: "[WBMSG] Impersonation session elevated to edit mode",
        html: `<p>Super admin <b>${esc(actorId)}</b> elevated an impersonation session to edit mode.</p>` +
          `<p>Organization: ${esc(orgId)}<br/>Target user: ${esc(targetUserId)}</p><p>Reason: ${esc(reason)}</p>`,
      });
    } catch (err) {
      fastify.log.error(err, "Failed to notify super admins of impersonation elevation");
    }
  }

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
      const adminId = request.auth.userId;
      // Only the issuing admin may revoke their own token. Idempotent for expired tokens.
      const raw = await redis.get(`impersonate:${token}`);
      if (raw) {
        let parsed: { issuedBy?: string; organizationId?: string } = {};
        try { parsed = JSON.parse(raw) as typeof parsed; } catch { parsed = {}; }
        if (parsed.issuedBy !== adminId || (parsed.organizationId && parsed.organizationId !== request.params.id)) {
          return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only the issuing admin can end this session" } });
        }
        await redis.del(`impersonate:${token}`);
      }
      await fastify.prisma.impersonationLog.updateMany({
        where: { token, actorId: adminId, endedAt: null },
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

  // ── Orphaned conversation cleanup ────────────────────────────────────────
  // Conversations with contactId = NULL are left behind when contacts are deleted.
  // Messages have no cascade on the conversation FK so they must be deleted first.
  fastify.get("/admin/conversations/cleanup", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const [conversations, messages] = await Promise.all([
      fastify.prisma.conversation.count({ where: { contactId: null } }),
      fastify.prisma.message.count({ where: { conversation: { contactId: null } } }),
    ]);
    return reply.send({ data: { dryRun: true, conversations, messages } });
  });

  fastify.delete("/admin/conversations/cleanup", async (request, reply) => {
    if (!requireSuperAdmin(request.auth.role, reply)) return;
    const BATCH = 500;
    let deletedConversations = 0;
    let deletedMessages = 0;
    let keepGoing = true;
    while (keepGoing) {
      const batch = await fastify.prisma.conversation.findMany({
        where: { contactId: null },
        select: { id: true },
        take: BATCH,
      });
      if (batch.length === 0) break;
      const ids = batch.map((c) => c.id);
      const [msgResult] = await fastify.prisma.$transaction([
        fastify.prisma.message.deleteMany({ where: { conversationId: { in: ids } } }),
        fastify.prisma.conversation.deleteMany({ where: { id: { in: ids } } }),
      ]);
      deletedMessages += msgResult.count;
      deletedConversations += batch.length;
      if (batch.length < BATCH) keepGoing = false;
    }
    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: request.auth.userId,
      action: "conversations.cleanup",
      targetType: "platform",
      metadata: { deletedConversations, deletedMessages },
      request,
    });
    return reply.send({ data: { deletedConversations, deletedMessages } });
  });

  // ── Activity log purge ────────────────────────────────────────────────────
  fastify.delete<{ Querystring: { retentionDays?: string } }>(
    "/admin/activity-logs/purge",
    async (request, reply) => {
      if (!requireSuperAdmin(request.auth.role, reply)) return;
      const retentionDays = Math.max(1, parseInt(request.query.retentionDays ?? "90", 10) || 90);
      const cutoff = new Date(Date.now() - retentionDays * 86400000);
      const result = await fastify.prisma.activityLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: request.auth.userId,
        action: "activity_logs.purge",
        targetType: "platform",
        metadata: { retentionDays, cutoff: cutoff.toISOString(), deleted: result.count },
        request,
      });
      return reply.send({ data: { deleted: result.count, cutoff: cutoff.toISOString(), retentionDays } });
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
