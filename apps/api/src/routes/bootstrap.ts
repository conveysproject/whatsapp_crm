import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "crypto";
import { redis } from "../lib/redis.js";
import {
  createClerkSuperAdmin,
  verifyBootstrapSecret,
  isBootstrapEnabled,
} from "../lib/clerk-admin.js";
import { writeAdminAudit } from "../lib/audit.js";

// Redis key tracking total bootstrap attempts — max 5 ever, no expiry
const BOOTSTRAP_ATTEMPTS_KEY = "bootstrap:attempts";
const MAX_BOOTSTRAP_ATTEMPTS = 5;

export const bootstrapRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { email: string; firstName: string; lastName: string };
  }>(
    "/admin/bootstrap",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email", "firstName", "lastName"],
          properties: {
            email:     { type: "string", format: "email" },
            firstName: { type: "string", minLength: 1, maxLength: 100 },
            lastName:  { type: "string", minLength: 1, maxLength: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      // 1. Endpoint disabled when BOOTSTRAP_SECRET not set or too short
      if (!isBootstrapEnabled()) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
      }

      // 2. Constant-time secret verification
      const provided = (request.headers["x-bootstrap-secret"] as string | undefined) ?? "";
      if (!verifyBootstrapSecret(provided)) {
        fastify.log.warn({ ip: request.ip }, "Bootstrap secret mismatch");
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid secret" } });
      }

      // 3. Global attempt counter — brute-force protection beyond rate limiting
      const attempts = await redis.incr(BOOTSTRAP_ATTEMPTS_KEY);
      if (attempts > MAX_BOOTSTRAP_ATTEMPTS) {
        fastify.log.error({ ip: request.ip }, "Bootstrap attempt limit exceeded");
        return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Bootstrap attempt limit exceeded" } });
      }

      // 4. One-time guard — if any superAdmin already exists, return 410 Gone permanently
      const existing = await fastify.prisma.user.findFirst({
        where: { role: "superAdmin" },
        select: { id: true },
      });
      if (existing) {
        return reply.status(410).send({
          error: { code: "GONE", message: "Super admin already exists. Bootstrap endpoint is permanently disabled." },
        });
      }

      const { email, firstName, lastName } = request.body;

      // 5. Ensure platform org exists (seed may not have run)
      await fastify.prisma.organization.upsert({
        where: { id: "platform" },
        create: { id: "platform", name: "TrustCRM Platform", status: "active" },
        update: {},
      });

      // 6. Create Clerk user with a cryptographically random temp password
      const tempPassword = randomBytes(24).toString("base64url") + "!Aa1";
      let clerkUserId: string;
      try {
        const clerkUser = await createClerkSuperAdmin(email, firstName, lastName, tempPassword);
        clerkUserId = clerkUser.id;
      } catch (err) {
        fastify.log.error({ err }, "Clerk user creation failed during bootstrap");
        return reply.status(502).send({ error: { code: "UPSTREAM_ERROR", message: "Failed to create Clerk account" } });
      }

      // 7. Upsert superAdmin DB user — handles both new users and existing Clerk accounts
      try {
        await fastify.prisma.user.upsert({
          where: { id: clerkUserId },
          create: {
            id: clerkUserId,
            organizationId: "platform",
            email,
            fullName: `${firstName} ${lastName}`,
            role: "superAdmin",
            isActive: true,
          },
          update: {
            role: "superAdmin",
            organizationId: "platform",
            isActive: true,
            deletedAt: null,
          },
        });
      } catch (err) {
        fastify.log.error({ err }, "DB user creation failed during bootstrap");
        return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Failed to create super admin" } });
      }

      // 8. Immutable audit record
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: clerkUserId,
        action: "bootstrap",
        targetType: "user",
        targetId: clerkUserId,
        metadata: { email, ip: request.ip },
        request,
      });

      fastify.log.info({ clerkUserId, email, ip: request.ip }, "SuperAdmin bootstrapped");

      // 9. Return minimal info — credentials delivered via Clerk email
      return reply.status(201).send({
        data: {
          message: "Super admin created. Check email for login credentials. IMPORTANT: remove BOOTSTRAP_SECRET from env and delete this route.",
          clerkUserId,
          email,
        },
      });
    }
  );
};
