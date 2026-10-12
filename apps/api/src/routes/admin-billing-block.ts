import type { FastifyPluginAsync } from "fastify";
import { loadBillingConfig } from "../lib/billing/settings.js";
import { clearStandingCache, isExempt, readBlockSettings, standingFrom } from "../lib/billing/send-guard.js";
import { parseCycleKey } from "../lib/billing/cycle.js";

const FORBIDDEN = { error: { code: "FORBIDDEN", message: "Super admin access required" } };

/** Super-admin only: who is overdue or paused for non-payment, and per-customer overrides (pause until a date, exempt). */
export const adminBillingBlockRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/admin/billing/overdue", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const now = new Date();
    const config = await loadBillingConfig(fastify.prisma);
    const rows = await fastify.prisma.billingStatement.findMany({
      where: { status: "issued", dueAt: { lt: now } },
      select: { organizationId: true, month: true, dueAt: true, paymentUrl: true, amountMinor: true, currency: true },
      orderBy: { dueAt: "asc" },
      take: 500,
    });
    const orgIds = [...new Set(rows.map((r) => r.organizationId))];
    const orgs = orgIds.length > 0
      ? await fastify.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, settings: true } })
      : [];
    const byId = new Map(orgs.map((o) => [o.id, o]));
    const data = orgIds.map((id) => {
      const org = byId.get(id);
      const mine = rows.filter((r) => r.organizationId === id);
      const settings = readBlockSettings(org?.settings);
      const exempt = isExempt(org?.name, org?.settings, now);
      // Only statements with a payment link can ever lead to a block.
      const standing = standingFrom({ mode: config.blockingMode, now, exempt, statements: mine.filter((m) => m.paymentUrl !== null).map((m) => ({ month: m.month, dueAt: m.dueAt })) });
      return {
        organizationId: id,
        name: org?.name ?? "(deleted organization)",
        statements: mine.map((m) => ({ month: m.month, dueAt: m.dueAt, hasLink: m.paymentUrl !== null, amountMinor: m.amountMinor, currency: m.currency })),
        state: standing.state,
        blockAt: standing.blockAt,
        exempt,
        manualExempt: settings.exempt,
        pauseUntil: settings.pauseUntil ? settings.pauseUntil.toISOString().slice(0, 10) : null,
        wouldBlockOrBlocked: standing.state === "blocked",
      };
    });
    return reply.send({ data: { mode: config.blockingMode, organizations: data } });
  });

  fastify.put<{ Body: { organizationId?: unknown; exempt?: unknown; pauseUntil?: unknown } }>("/admin/billing/org-block", async (request, reply) => {
    if (request.auth.role !== "superAdmin") return reply.status(403).send(FORBIDDEN);
    const { organizationId, exempt, pauseUntil } = request.body ?? {};
    const badDate = pauseUntil !== undefined && pauseUntil !== null && (typeof pauseUntil !== "string" || !parseCycleKey(pauseUntil));
    if (typeof organizationId !== "string" || organizationId.length === 0 || (exempt !== undefined && typeof exempt !== "boolean") || badDate || (exempt === undefined && pauseUntil === undefined)) {
      return reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "organizationId and exempt (true or false) and/or pauseUntil (YYYY-MM-DD or null) are required" } });
    }
    const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });
    const current = org.settings && typeof org.settings === "object" && !Array.isArray(org.settings) ? (org.settings as Record<string, unknown>) : {};
    const prev = readBlockSettings(org.settings);
    const next = {
      exempt: exempt === undefined ? prev.exempt : exempt,
      pauseUntil: pauseUntil === undefined ? (prev.pauseUntil ? prev.pauseUntil.toISOString().slice(0, 10) : null) : (pauseUntil as string | null),
    };
    await fastify.prisma.organization.update({ where: { id: organizationId }, data: { settings: { ...current, billingBlock: next } as never } });
    clearStandingCache(organizationId);
    return reply.send({ data: { organizationId, ...next } });
  });
};
