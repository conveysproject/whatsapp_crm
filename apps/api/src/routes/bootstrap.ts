import type { FastifyPluginAsync } from "fastify";
import { redis } from "../lib/redis.js";
import { verifyBootstrapSecret, isBootstrapEnabled } from "../lib/bootstrap-secret.js";
import { writeAdminAudit } from "../lib/audit.js";
import { revokeAllSessions } from "../auth/sessions.js";
import { normalizeEmail } from "../auth/ids.js";
import { assertNoUserForEmail, ensureSuperAdminAccount, isUniqueViolation, SuperAdminConflictError } from "../auth/admin-accounts.js";

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

      const { firstName, lastName } = request.body;
      const email = normalizeEmail(request.body.email);

      // 5. Ensure platform org exists (seed may not have run)
      await fastify.prisma.organization.upsert({
        where: { id: "platform" },
        create: { id: "platform", name: "TrustCRM Platform", status: "active" },
        update: {},
      });

      // 6-7. The account must set its password via Forgot password.
      let userId: string;
      let reused = false;
      try {
        const result = await fastify.prisma.$transaction(async (tx) => {
          await assertNoUserForEmail(tx, email);
          const account = await ensureSuperAdminAccount(tx, { email, firstName, lastName });
          await tx.user.create({
            data: {
              id: account.id,
              organizationId: "platform",
              email,
              fullName: `${firstName} ${lastName}`,
              role: "superAdmin",
              isActive: true,
            },
          });
          return { id: account.id, reused: !account.created };
        });
        userId = result.id;
        reused = result.reused;
      } catch (err) {
        if (isUniqueViolation(err) || err instanceof SuperAdminConflictError) {
          return reply.status(409).send({ error: { code: "CONFLICT", message: "A super admin with this email already exists" } });
        }
        fastify.log.error({ err }, "Super admin creation failed during bootstrap");
        return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Failed to create super admin" } });
      }
      if (reused) {
        await revokeAllSessions(fastify.prisma, userId, "promoted_to_super_admin").catch(() => undefined);
      }
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "bootstrap",
        targetType: "user",
        targetId: userId,
        metadata: { email, ip: request.ip },
        request,
      });
      fastify.log.info({ userId, email, ip: request.ip }, "SuperAdmin bootstrapped");
      return reply.status(201).send({
        data: {
          message: "Super admin created. Use Forgot password on the sign-in page to set a password. IMPORTANT: remove BOOTSTRAP_SECRET from env and delete this route.",
          userId,
          email,
          setPassword: "forgot_password",
        },
      });
    }
  );
};
