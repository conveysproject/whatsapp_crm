import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";

interface RegisterBody {
  companyName: string;
  companyWebsite: string;
  companyLocation: string;
  industry: string;
  subCategory: string;
  revenue: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export const registerRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RegisterBody }>(
    "/register",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["companyName", "industry", "revenue"],
          properties: {
            companyName:     { type: "string", minLength: 1, maxLength: 255 },
            companyWebsite:  { type: "string" },
            companyLocation: { type: "string" },
            industry:        { type: "string" },
            subCategory:     { type: "string" },
            revenue:         { type: "string" },
            email:           { type: "string" },
            firstName:       { type: "string" },
            lastName:        { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      let userId: string;
      try {
        ({ userId } = await verifyClerkToken(request.headers.authorization));
      } catch {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const {
        companyName, companyWebsite, companyLocation,
        industry, subCategory, revenue,
        email = "", firstName = "", lastName = "",
      } = request.body;

      const fullName = [firstName, lastName].filter(Boolean).join(" ") || email;

      // Check if this user already belongs to an org (re-submission guard)
      const existingUser = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true, role: true },
      });

      let organizationId: string;

      if (existingUser) {
        // Only the org admin may update business details after initial setup.
        // Agents/viewers hitting this endpoint (e.g. via API) must be rejected.
        if (existingUser.role !== "admin") {
          return reply.status(403).send({ error: "Only org admins can update business details" });
        }

        organizationId = existingUser.organizationId;
        await fastify.prisma.organization.update({
          where: { id: organizationId },
          data: {
            name: companyName,
            website: companyWebsite,
            location: companyLocation,
            industry,
            subCategory,
            revenue,
            settings: {
              website: companyWebsite,
              location: companyLocation,
              industry,
              subCategory,
              revenue,
            },
          },
        });
      } else {
        // First-time: create org + user
        const org = await fastify.prisma.organization.create({
          data: {
            name: companyName,
            website: companyWebsite,
            location: companyLocation,
            industry,
            subCategory,
            revenue,
            registeredAt: new Date(),
            settings: {
              website: companyWebsite,
              location: companyLocation,
              industry,
              subCategory,
              revenue,
              registeredAt: new Date().toISOString(),
            },
          },
        });
        organizationId = org.id;

        // GAP-S02: if vendor activation is required, start inactive until superAdmin approves
        const requireActivation = process.env["REQUIRE_VENDOR_ACTIVATION"] === "true";
        await fastify.prisma.user.create({
          data: {
            id: userId,
            organizationId,
            email,
            fullName,
            role: "admin",
            isActive: !requireActivation,
          },
        });
      }

      return reply.send({ success: true, organizationId });
    }
  );
};