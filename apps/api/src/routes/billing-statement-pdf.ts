import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { cycleContaining, parseCycleKey } from "../lib/billing/cycle.js";
import { readBillingDetails } from "../lib/billing/billing-details.js";
import { loadBillingConfig } from "../lib/billing/settings.js";
import { buildStatementPdf, invoiceNumberFor } from "../lib/billing/statement-pdf.js";

/** PDF of one issued statement of the caller's own organization. Drafts and voided statements are never downloadable. */
export const billingStatementPdfRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { cycle: string } }>("/billing/statements/:cycle/pdf", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_billing")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_billing permission required" } });
    }
    const start = parseCycleKey(request.params.cycle);
    if (!start) return reply.status(400).send({ error: { code: "INVALID_CYCLE", message: "cycle must be a date in YYYY-MM-DD format" } });

    const st = await fastify.prisma.billingStatement.findFirst({
      where: { organizationId, month: request.params.cycle, status: { in: ["issued", "no_payment", "paid"] } },
      select: { id: true, month: true, messages: true, bandName: true, amountInr: true, amountUsd: true, status: true, currency: true, amountMinor: true, taxMinor: true, dueAt: true, issuedAt: true },
    });
    if (!st) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Statement not found" } });
    const org = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, createdAt: true, settings: true } });
    if (!org) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Organization not found" } });

    const config = await loadBillingConfig(fastify.prisma);
    const cycle = cycleContaining(org.createdAt, start);
    const currency: "INR" | "USD" = st.currency === "USD" ? "USD" : "INR";
    const taxMinor = st.taxMinor ?? 0;
    const baseMinor = st.amountMinor !== null ? st.amountMinor - taxMinor : ((currency === "USD" ? st.amountUsd : st.amountInr) ?? 0) * 100;
    const totalMinor = st.amountMinor ?? baseMinor;
    const details = readBillingDetails(org.settings);

    const pdf = await buildStatementPdf({
      invoiceNumber: invoiceNumberFor(st.month, st.id),
      issuedAt: st.issuedAt,
      dueAt: st.dueAt,
      status: st.status,
      periodStart: cycle.start,
      periodEnd: new Date(cycle.endExclusive.getTime() - 86_400_000),
      seller: config.seller,
      buyer: { name: org.name, legalName: details.legalName, gstin: details.gstin, address: details.address, email: details.billingEmail },
      messages: st.messages,
      bandName: st.bandName,
      currency,
      baseMinor,
      taxMinor,
      taxRatePercent: taxMinor > 0 && config.gstRatePercent > 0 ? config.gstRatePercent : null,
      totalMinor,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="wbmsg-statement-${st.month}.pdf"`)
      .header("Cache-Control", "private, no-store")
      .send(pdf);
  });
};
