import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { canAccess, canAccessSub } from "../lib/permissions.js";

/** Convert a nullable JSON body value to the form Prisma expects. */
function toJsonField(
  value: Record<string, unknown> | null
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

interface BusinessHoursSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface PutBusinessHoursBody {
  slots: BusinessHoursSlot[];
}

export const automationSettingsRouter: FastifyPluginAsync = async (fastify) => {
  // All automation routes require automation_access
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccess(role, permissions, "automation_access")) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "automation_access permission required" },
      });
    }
  });

  // --- Business Hours ---

  fastify.get("/automation/business-hours", async (request, reply) => {
    const { organizationId } = request.auth;
    const slots = await fastify.prisma.businessHours.findMany({
      where: { organizationId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return reply.send({ data: slots });
  });

  fastify.put<{ Body: PutBusinessHoursBody }>(
    "/automation/business-hours",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_ooo")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_ooo permission required" },
        });
      }

      const { slots } = request.body;

      // Validate slot shapes
      for (const s of slots) {
        if (
          typeof s.dayOfWeek !== "number" || s.dayOfWeek < 0 || s.dayOfWeek > 6 ||
          !/^\d{2}:\d{2}$/.test(s.startTime) ||
          !/^\d{2}:\d{2}$/.test(s.endTime)
        ) {
          return reply.status(400).send({
            error: { code: "INVALID_SLOT", message: "Each slot needs dayOfWeek (0-6), startTime, endTime in HH:MM" },
          });
        }
      }

      // Atomic replace: delete all existing, insert new
      const [, created] = await fastify.prisma.$transaction([
        fastify.prisma.businessHours.deleteMany({ where: { organizationId } }),
        fastify.prisma.businessHours.createMany({
          data: slots.map((s) => ({
            organizationId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
          })),
        }),
      ]);

      request.log.info({ organizationId, count: created.count }, "business hours replaced");
      return reply.send({ data: { count: created.count } });
    }
  );

  // --- Automation Settings (GET singleton) ---

  fastify.get("/automation/settings", async (request, reply) => {
    const { organizationId } = request.auth;
    const settings = await fastify.prisma.orgAutomationSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
    return reply.send({ data: settings });
  });

  // --- PUT OOO ---

  interface PutOooBody {
    oooEnabled?: boolean;
    oooMessage?: string | null;
    oooMessageData?: Record<string, unknown> | null;
  }

  fastify.put<{ Body: PutOooBody }>(
    "/automation/settings/ooo",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_ooo")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_ooo permission required" },
        });
      }

      const { oooEnabled, oooMessage, oooMessageData } = request.body;

      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...(oooEnabled !== undefined && { oooEnabled }),
          ...(oooMessage !== undefined && { oooMessage }),
          ...(oooMessageData !== undefined && { oooMessageData: toJsonField(oooMessageData) }),
        },
        update: {
          ...(oooEnabled !== undefined && { oooEnabled }),
          ...(oooMessage !== undefined && { oooMessage }),
          ...(oooMessageData !== undefined && { oooMessageData: toJsonField(oooMessageData) }),
        },
      });

      return reply.send({ data: settings });
    }
  );

  // --- PUT Welcome ---

  interface PutWelcomeBody {
    welcomeEnabled?: boolean;
    welcomePersonalized?: boolean;
    welcomeMessage?: string | null;
    welcomeMessageData?: Record<string, unknown> | null;
    welcomeNewMessage?: string | null;
    welcomeNewData?: Record<string, unknown> | null;
    welcomeReturningMessage?: string | null;
    welcomeReturningData?: Record<string, unknown> | null;
    welcomeFlowId?: string | null;
  }

  fastify.put<{ Body: PutWelcomeBody }>(
    "/automation/settings/welcome",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_welcome_message")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_welcome_message permission required" },
        });
      }

      const {
        welcomeEnabled, welcomePersonalized, welcomeMessage, welcomeMessageData,
        welcomeNewMessage, welcomeNewData, welcomeReturningMessage, welcomeReturningData,
        welcomeFlowId,
      } = request.body;

      const updateData = {
        ...(welcomeEnabled !== undefined && { welcomeEnabled }),
        ...(welcomePersonalized !== undefined && { welcomePersonalized }),
        ...(welcomeMessage !== undefined && { welcomeMessage }),
        ...(welcomeMessageData !== undefined && { welcomeMessageData: toJsonField(welcomeMessageData) }),
        ...(welcomeNewMessage !== undefined && { welcomeNewMessage }),
        ...(welcomeNewData !== undefined && { welcomeNewData: toJsonField(welcomeNewData) }),
        ...(welcomeReturningMessage !== undefined && { welcomeReturningMessage }),
        ...(welcomeReturningData !== undefined && { welcomeReturningData: toJsonField(welcomeReturningData) }),
        ...(welcomeFlowId !== undefined && { welcomeFlowId }),
      };

      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: { organizationId, ...updateData },
        update: updateData,
      });

      return reply.send({ data: settings });
    }
  );

  // --- PUT Delayed Response ---

  interface PutDelayedBody {
    delayedEnabled?: boolean;
    delayedMinutes?: number;
    delayedMessage?: string | null;
    delayedMessageData?: Record<string, unknown> | null;
    delayedSendWithOoo?: boolean;
  }

  fastify.put<{ Body: PutDelayedBody }>(
    "/automation/settings/delayed",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "automation_access", "automation_delayed_response")) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "automation_delayed_response permission required" },
        });
      }

      const { delayedEnabled, delayedMinutes, delayedMessage, delayedMessageData, delayedSendWithOoo } = request.body;

      // Validate minutes: must be 1–1440
      if (delayedMinutes !== undefined && (delayedMinutes < 1 || delayedMinutes > 1440)) {
        return reply.status(400).send({
          error: { code: "INVALID_MINUTES", message: "delayedMinutes must be between 1 and 1440" },
        });
      }

      const settings = await fastify.prisma.orgAutomationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...(delayedEnabled !== undefined && { delayedEnabled }),
          ...(delayedMinutes !== undefined && { delayedMinutes }),
          ...(delayedMessage !== undefined && { delayedMessage }),
          ...(delayedMessageData !== undefined && { delayedMessageData: toJsonField(delayedMessageData) }),
          ...(delayedSendWithOoo !== undefined && { delayedSendWithOoo }),
        },
        update: {
          ...(delayedEnabled !== undefined && { delayedEnabled }),
          ...(delayedMinutes !== undefined && { delayedMinutes }),
          ...(delayedMessage !== undefined && { delayedMessage }),
          ...(delayedMessageData !== undefined && { delayedMessageData: toJsonField(delayedMessageData) }),
          ...(delayedSendWithOoo !== undefined && { delayedSendWithOoo }),
        },
      });

      return reply.send({ data: settings });
    }
  );
};
