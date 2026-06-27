import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../lib/default-role-permissions.js";
import { seedLeadStatuses } from "../lib/seed-lead-statuses.js";

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
  // public: true is intentional — a first-time user has no DB row yet so the
  // auth plugin would reject them. JWT verification is done manually below.
  fastify.post<{ Body: RegisterBody }>(
    "/register",
    {
      config: {
        public: true,
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
          // Keyed by IP (no auth on public route). Prevents mass org creation
          // even if attacker rotates Clerk tokens from a single machine.
          keyGenerator: (req) => `register:${req.ip}`,
        },
      },
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
        if (existingUser.role !== "admin") {
          // Check if this is a webhook-stub race: org was auto-created but the
          // founder's admin role hasn't been written yet (webhook fired before /register).
          // If the org has no industry set, it's an unprovisioned stub — promote and continue.
          const orgStub = await fastify.prisma.organization.findUnique({
            where: { id: existingUser.organizationId },
            select: { industry: true },
          });
          if (orgStub?.industry) {
            // Org is fully provisioned — this non-admin is not the founder.
            return reply.status(403).send({ error: "Only org admins can update business details" });
          }
          await fastify.prisma.user.update({
            where: { id: userId },
            data: { role: "admin" },
          });
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
        await seedLeadStatuses(fastify.prisma, organizationId);

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

        await fastify.prisma.vendorSetting.createMany({
          data: (Object.entries(DEFAULT_ROLE_PERMISSIONS) as [string, Record<string, string>][]).map(
            ([role, perms]) => ({
              organizationId,
              key: `role_permissions_${role}`,
              value: JSON.stringify(perms),
            })
          ),
          skipDuplicates: true,
        });
      }

      return reply.send({ success: true, organizationId });
    }
  );
};