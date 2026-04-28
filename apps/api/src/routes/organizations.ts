import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

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
    async (request) => {
      const org = await prisma.organization.update({
        where: { id: request.auth.organizationId },
        data: {
          name: request.body.name,
          settings: request.body.settings as Prisma.InputJsonValue | undefined,
        },
      });
      return { data: org };
    }
  );
};
