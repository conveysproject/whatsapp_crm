import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Keys managed server-side only — never overwritable via PATCH /organizations/me
const PROTECTED_SETTINGS_KEYS = new Set([
  "stripeCustomerId",
  "wabaAccessToken",
  "whatsappBusinessAccountId",
]);

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/organizations/me", async (request) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: request.auth.organizationId },
    });
    return { data: org };
  });

  fastify.patch<{ Body: { name?: string; settings?: Record<string, unknown> } }>(
    "/organizations/me",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            settings: { type: "object" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "admin" && request.auth.role !== "manager") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins and managers can update organization settings" } });
      }

      let settingsUpdate: Prisma.InputJsonValue | undefined;
      if (request.body.settings !== undefined) {
        const existing = await prisma.organization.findUnique({
          where: { id: request.auth.organizationId },
          select: { settings: true },
        });
        const current = (existing?.settings as Record<string, unknown>) ?? {};
        const incoming = request.body.settings;
        // Strip protected keys from the incoming patch, then merge over existing
        const safe = Object.fromEntries(
          Object.entries(incoming).filter(([k]) => !PROTECTED_SETTINGS_KEYS.has(k))
        );
        settingsUpdate = { ...current, ...safe } as Prisma.InputJsonValue;
      }

      const org = await prisma.organization.update({
        where: { id: request.auth.organizationId },
        data: {
          name: request.body.name,
          settings: settingsUpdate,
        },
      });
      return { data: org };
    }
  );
};
