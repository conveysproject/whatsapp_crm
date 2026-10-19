import type { FastifyPluginAsync } from "fastify";
import { verifyBearer } from "../auth/identity.js";
import { BUSINESS_SCHEMA, createWorkspace } from "../lib/create-workspace.js";

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
          // even if attacker rotates tokens from a single machine.
          keyGenerator: (req) => `register:${req.ip}`,
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["companyName", "industry", "revenue"],
          properties: {
            ...BUSINESS_SCHEMA,
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
        ({ userId } = await verifyBearer(request.headers.authorization));
      } catch {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const {
        companyName, companyWebsite, companyLocation,
        industry, subCategory, revenue,
      } = request.body;
      let { email = "", firstName = "", lastName = "" } = request.body;

      // Identity comes from the verified account, never from the request body.
      const account = await fastify.prisma.authAccount.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true, emailVerifiedAt: true },
      });
      if (!account || !account.emailVerifiedAt) {
        return reply.status(403).send({
          error: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email before setting up your business." },
        });
      }
      email = account.email;
      firstName = account.firstName ?? "";
      lastName = account.lastName ?? "";

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
        ({ organizationId } = await createWorkspace(fastify.prisma, {
          userId,
          email,
          fullName,
          business: { companyName, companyWebsite, companyLocation, industry, subCategory, revenue },
        }));
      }

      return reply.send({ success: true, organizationId });
    }
  );
};