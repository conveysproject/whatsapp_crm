import type { FastifyPluginAsync } from "fastify";
import type { CampaignStatus } from "@prisma/client";
import { campaignQueue } from "../lib/queue.js";
import type { CampaignId, SegmentId, TemplateId } from "@WBMSG/shared";
import { evaluateSegment, type FilterRule } from "../lib/segment-evaluator.js";
import { maskPhone, maskEmail, canAccess, canAccessSub } from "../lib/permissions.js";
import { checkPlanLimit } from "../lib/plan-limits.js";

interface CampaignBody {
  name: string;
  templateId?: TemplateId;
  textBody?: string;
  campaignType?: string;
  segmentId?: SegmentId;
  scheduledAt?: string;
  messageInterval?: number;
  mediaUrl?: string;
  // GAP-S70: accept CSV string OR array; normalize to array
  contactGroup?: string | string[];
  contactLabels?: string | string[];
}

// GAP-S15: computed display status and delete eligibility
type DisplayStatus = "upcoming" | "running" | "paused" | "completed" | "aborted" | "cancelled" | "draft" | "scheduled";

function computeDisplayStatus(status: CampaignStatus, scheduledAt: Date | null): DisplayStatus {
  if (status === "aborted") return "aborted";
  if (status === "scheduled" && scheduledAt && scheduledAt > new Date()) return "upcoming";
  return status as DisplayStatus;
}

function isDeleteAllowed(status: CampaignStatus, scheduledAt: Date | null): boolean {
  if (status === "draft") return true;
  if (status === "scheduled" && scheduledAt && scheduledAt > new Date()) return true;
  return false;
}

// GAP-S70: normalize contactGroup/contactLabels from CSV string or array to string[]
function normalizeGroupIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export const campaignsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaigns = await fastify.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    const data = campaigns.map((c) => ({
      ...c,
      displayStatus: computeDisplayStatus(c.status, c.scheduledAt),
      deleteAllowed: isDeleteAllowed(c.status, c.scheduledAt),
    }));
    return reply.send({ data });
  });

  fastify.get<{ Params: { id: CampaignId } }>("/campaigns/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!campaign) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    }
    return reply.send({
      data: {
        ...campaign,
        displayStatus: computeDisplayStatus(campaign.status, campaign.scheduledAt),
        deleteAllowed: isDeleteAllowed(campaign.status, campaign.scheduledAt),
      },
    });
  });

  fastify.post<{ Body: CampaignBody }>("/campaigns", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    // GAP-S04: campaigns_access + campaigns_create sub-permission required to create campaigns
    if (!canAccessSub(role, permissions, "campaigns_access", "campaigns_create")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "campaigns_create permission required" } });
    }
    const limitCheck = await checkPlanLimit(fastify.prisma, organizationId, "campaigns");
    if (!limitCheck.allowed) {
      return reply.status(402).send({ error: { code: "PLAN_LIMIT_REACHED", message: `Campaign limit of ${limitCheck.limit} reached` } });
    }
    const { name, templateId, textBody, campaignType, scheduledAt, messageInterval } = request.body;
    // For text campaigns, store the body in templateId field (worker reads it regardless of type)
    const resolvedTemplateId = campaignType === "text" || campaignType === "non_template"
      ? (textBody ?? null)
      : (templateId ?? null);
    const campaign = await fastify.prisma.campaign.create({
      data: {
        organizationId,
        name,
        templateId: resolvedTemplateId,
        campaignType: campaignType ?? "template",
        status: "draft" as CampaignStatus,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        messageInterval: messageInterval ?? null,
        mediaUrl: request.body.mediaUrl ?? null,
      },
    });
    // Persist group associations
    const groupIds = normalizeGroupIds(request.body.contactGroup);
    if (groupIds.length > 0) {
      await fastify.prisma.campaignGroup.createMany({
        data: groupIds.map((contactGroupId) => ({ campaignId: campaign.id, contactGroupId })),
        skipDuplicates: true,
      });
    }
    return reply.status(201).send({ data: campaign });
  });

  fastify.patch<{ Params: { id: CampaignId }; Body: Partial<CampaignBody> }>(
    "/campaigns/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!campaign) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      }
      if (campaign.status !== "draft") {
        return reply.status(400).send({ error: { code: "NOT_DRAFT", message: "Only draft campaigns can be edited" } });
      }
      const { name, templateId, textBody, campaignType, scheduledAt, messageInterval } = request.body;
      const resolvedTemplateId = campaignType === "text" || campaignType === "non_template"
        ? (textBody ?? campaign.templateId)
        : (templateId ?? campaign.templateId);
      const updated = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          ...(name ? { name } : {}),
          ...(resolvedTemplateId !== undefined ? { templateId: resolvedTemplateId } : {}),
          ...(campaignType ? { campaignType } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
          ...(messageInterval !== undefined ? { messageInterval } : {}),
          ...(request.body.mediaUrl !== undefined ? { mediaUrl: request.body.mediaUrl } : {}),
        },
      });
      return reply.send({ data: updated });
    }
  );

  fastify.post<{ Params: { id: CampaignId }; Body: { scheduledAt?: string; segmentId?: SegmentId; groupIds?: string[] } }>(
    "/campaigns/:id/schedule",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!campaign) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      }

      const scheduledAt = request.body.scheduledAt ? new Date(request.body.scheduledAt) : new Date();
      const delay = Math.max(0, scheduledAt.getTime() - Date.now());

      // Persist any groupIds passed at schedule time (if not already saved on create)
      const groupIds = normalizeGroupIds(request.body.groupIds);
      if (groupIds.length > 0) {
        await fastify.prisma.campaignGroup.createMany({
          data: groupIds.map((contactGroupId) => ({ campaignId: campaign.id, contactGroupId })),
          skipDuplicates: true,
        });
      }

      await campaignQueue.add(
        "send-campaign",
        { campaignId: campaign.id, organizationId, segmentId: request.body.segmentId },
        { delay }
      );

      const updated = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "scheduled" as CampaignStatus, scheduledAt },
      });

      return reply.send({ data: updated });
    }
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: CampaignId } }>("/campaigns/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    }
    if (!isDeleteAllowed(campaign.status, campaign.scheduledAt)) {
      return reply.status(409).send({ error: { code: "DELETE_NOT_ALLOWED", message: "Campaign cannot be deleted in its current state" } });
    }
    await fastify.prisma.campaign.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  // ── Targeted contact count preview ───────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { groupIds?: string } }>(
    "/campaigns/:id/targeted-count",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });

      const groupIds = request.query.groupIds?.split(",").filter(Boolean) ?? [];
      let count: number;

      if (groupIds.length > 0) {
        const groupContacts = await fastify.prisma.groupContact.findMany({
          where: { contactGroupId: { in: groupIds } },
          select: { contactId: true },
        });
        const contactIds = [...new Set(groupContacts.map((gc) => gc.contactId))];
        count = await fastify.prisma.contact.count({ where: { id: { in: contactIds }, organizationId } });
      } else {
        count = await fastify.prisma.contact.count({ where: { organizationId } });
      }

      return reply.send({ data: { count } });
    }
  );

  // ── Executed recipients ───────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/recipients",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      const raw = parseInt(request.query.page ?? "1", 10);
      const page = Number.isNaN(raw) || raw < 1 ? 1 : raw;
      const [data, total] = await Promise.all([
        fastify.prisma.campaignRecipient.findMany({
          where: { campaignId: request.params.id, status: { in: ["sent", "delivered", "read", "failed"] } },
          include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
          skip: (page - 1) * 50,
          take: 50,
          orderBy: { createdAt: "asc" },
        }),
        fastify.prisma.campaignRecipient.count({
          where: { campaignId: request.params.id, status: { in: ["sent", "delivered", "read", "failed"] } },
        }),
      ]);
      return reply.send({ data, total });
    }
  );

  // ── Abort ─────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/abort", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { status: "aborted" } });
    return reply.send({ data });
  });

  // ── Archive / unarchive ──────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/archive", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { isArchived: true } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/campaigns/:id/unarchive", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { isArchived: false } });
    return reply.send({ data });
  });

  // ── Requeue failed ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/requeue-failed", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const result = await fastify.prisma.campaignRecipient.updateMany({
      where: { campaignId: request.params.id, status: "failed" },
      data: { status: "pending" },
    });
    return reply.send({ data: { requeued: result.count } });
  });

  // ── Queue log (pending) ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/queue-log",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const raw = parseInt(request.query.page ?? "1", 10);
      const page = Number.isNaN(raw) || raw < 1 ? 1 : raw;
      const [data, total] = await Promise.all([
        fastify.prisma.campaignRecipient.findMany({
          where: { campaignId: request.params.id, status: "pending" },
          include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
          skip: (page - 1) * 50,
          take: 50,
          orderBy: { createdAt: "asc" },
        }),
        fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "pending" } }),
      ]);
      return reply.send({ data, total });
    }
  );

  // ── Expired log ──────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/expired-log",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const raw = parseInt(request.query.page ?? "1", 10);
      const page = Number.isNaN(raw) || raw < 1 ? 1 : raw;
      const [data, total] = await Promise.all([
        fastify.prisma.campaignRecipient.findMany({
          where: { campaignId: request.params.id, status: "expired" },
          include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true } } },
          skip: (page - 1) * 50,
          take: 50,
          orderBy: { createdAt: "asc" },
        }),
        fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "expired" } }),
      ]);
      return reply.send({ data, total });
    }
  );

  // ── Report ───────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/campaigns/:id/report", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const [sent, accepted, delivered, played, read, failed, pending, expired] = await Promise.all([
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "sent" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "accepted" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "delivered" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "played" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "read" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "failed" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "pending" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "expired" } }),
    ]);
    return reply.send({ data: { campaign, stats: { sent, accepted, delivered, played, read, failed, pending, expired } } });
  });

  // ── Pause ────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/pause", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    if (campaign.status !== "running" && campaign.status !== "scheduled") {
      return reply.status(400).send({ error: { code: "INVALID_STATUS", message: "Campaign is not running or scheduled" } });
    }
    const data = await fastify.prisma.campaign.update({
      where: { id: request.params.id },
      data: { status: "paused" as CampaignStatus },
    });
    return reply.send({ data });
  });

  // ── Resume ───────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { segmentId?: SegmentId } }>(
    "/campaigns/:id/resume",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      if (campaign.status !== "paused") {
        return reply.status(400).send({ error: { code: "INVALID_STATUS", message: "Campaign is not paused" } });
      }

      const firstSegment = await fastify.prisma.campaignSegment.findFirst({ where: { campaignId: campaign.id } });
      const segmentId = request.body?.segmentId ?? firstSegment?.segmentId;
      if (segmentId) {
        await campaignQueue.add(
          "send-campaign",
          { campaignId: campaign.id, organizationId, segmentId },
          { delay: 0 }
        );
      }

      const data = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "running" as CampaignStatus },
      });
      return reply.send({ data });
    }
  );

  // ── Dry-run preview ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { segmentId?: SegmentId; limit?: number } }>(
    "/campaigns/:id/preview",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
        include: { segments: true },
      });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });

      const segmentId = request.body?.segmentId ?? campaign.segments[0]?.segmentId;
      const limit = Math.min(request.body?.limit ?? 10, 50);
      const templateBody = campaign.templateId ?? "";

      let previewContacts: Array<{ id: string; firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null }>;
      let totalReach = 0;

      if (segmentId) {
        const segment = await fastify.prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
        if (segment) {
          const result = await evaluateSegment(fastify.prisma, organizationId, segment.filters as unknown as FilterRule[]);
          totalReach = result.count;
          const previewPhones = result.contacts.slice(0, limit).map((c) => c.phoneNumber);
          previewContacts = await fastify.prisma.contact.findMany({
            where: { organizationId, phoneNumber: { in: previewPhones } },
            select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
          });
        } else {
          previewContacts = [];
        }
      } else {
        previewContacts = await fastify.prisma.contact.findMany({
          where: { organizationId },
          select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
          take: limit,
        });
        totalReach = previewContacts.length;
      }

      const preview = previewContacts.map((c) => ({
        contactId: c.id,
        phone: c.phoneNumber,
        resolvedBody: templateBody
          .replace(/\{\{name\}\}/gi, [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phoneNumber)
          .replace(/\{\{phone\}\}/gi, c.phoneNumber)
          .replace(/\{\{email\}\}/gi, c.email ?? ""),
      }));

      return reply.send({ data: { totalReach, preview } });
    }
  );

  // ── Campaign report export (GAP-S16) — CSV with permission-based phone masking ──
  fastify.get<{ Params: { id: CampaignId } }>(
    "/campaigns/:id/export",
    async (request, reply) => {
      const { organizationId, permissions } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });

      const recipients = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, organizationId },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });

      // Batch-lookup contacts for recipients whose contactId was never linked (legacy rows)
      const unlinkedPhones = recipients.filter((r) => !r.contact).map((r) => r.phoneNumber);
      const lookedUp = unlinkedPhones.length > 0
        ? await fastify.prisma.contact.findMany({
            where: { organizationId, phoneNumber: { in: unlinkedPhones } },
            select: { firstName: true, lastName: true, phoneNumber: true, email: true },
          })
        : [];
      const byPhone = new Map(lookedUp.map((c) => [c.phoneNumber, c]));

      const maskPhones = permissions["hide_contact_phone_numbers"] === "allow";
      const maskEmails = permissions["hide_contact_emails"] === "allow";

      const header = "Contact Name,Phone Number,Email,Status,Sent At,Error\n";
      const rows = recipients.map((r) => {
        const resolved = r.contact ?? byPhone.get(r.phoneNumber) ?? null;
        const name = (resolved ? [resolved.firstName, resolved.lastName].filter(Boolean).join(" ") : r.fullName) || "";
        const rawPhone = resolved?.phoneNumber ?? r.phoneNumber;
        const phone = maskPhones ? maskPhone(rawPhone) : rawPhone;
        const email = maskEmails ? maskEmail(resolved?.email ?? "") : (resolved?.email ?? "");
        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        return [escape(name), escape(`="${phone}"`), escape(email), r.status, r.sentAt?.toISOString() ?? "", escape(r.errorMessage ?? "")].join(",");
      });

      const csv = header + rows.join("\n");
      const filename = `campaign-report-${campaign.name.replace(/\s+/g, "-")}.csv`;
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename=${filename}`);
      return reply.send("﻿" + csv); // UTF-8 BOM for Excel compatibility
    }
  );

  // ── Queue log export ──────────────────────────────────────────────────────
  fastify.get<{ Params: { id: CampaignId } }>(
    "/campaigns/:id/queue-log-export",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      const recipients = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "pending" },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      const header = "Contact Name,Phone Number,Email,Status\n";
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = recipients.map((r) => {
        const name = [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(" ") || "";
        return [escape(name), escape(`="${r.phoneNumber}"`), escape(r.contact?.email ?? ""), r.status].join(",");
      });
      const filename = `campaign-queue-${campaign.name.replace(/\s+/g, "-")}.csv`;
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename=${filename}`);
      return reply.send("﻿" + header + rows.join("\n"));
    }
  );

  // ── Expired log export ────────────────────────────────────────────────────
  fastify.get<{ Params: { id: CampaignId } }>(
    "/campaigns/:id/expired-log-export",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
      const recipients = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "expired" },
        include: { contact: { select: { firstName: true, lastName: true, phoneNumber: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      const header = "Contact Name,Phone Number,Email,Status\n";
      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const rows = recipients.map((r) => {
        const name = [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(" ") || "";
        return [escape(name), escape(`="${r.phoneNumber}"`), escape(r.contact?.email ?? ""), r.status].join(",");
      });
      const filename = `campaign-expired-${campaign.name.replace(/\s+/g, "-")}.csv`;
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename=${filename}`);
      return reply.send("﻿" + header + rows.join("\n"));
    }
  );
};
