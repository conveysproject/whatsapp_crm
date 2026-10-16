import type { FastifyPluginAsync } from "fastify";
import { issueCode, verifyCode } from "../codes.js";
import { trustDevice } from "../devices.js";
import { sendCodeEmail } from "../emails.js";
import { newAccountId, normalizeEmail } from "../ids.js";
import { checkPasswordPolicy, hashPassword } from "../password.js";
import { createSession } from "../sessions.js";

interface SignupBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}
interface VerifyBody {
  email: string;
  code: string;
  client: "web" | "mobile";
}

const INVALID_CODE = {
  error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." },
};

export const signupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SignupBody }>(
    "/signup",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "firstName", "lastName"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            password: { type: "string" },
            firstName: { type: "string", minLength: 1, maxLength: 100 },
            lastName: { type: "string", minLength: 1, maxLength: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { password, firstName, lastName } = request.body;
      const email = normalizeEmail(request.body.email);

      if (!checkPasswordPolicy(password).ok) {
        return reply.status(400).send({
          error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." },
        });
      }

      // Hash on every branch so a verified (no-op) email costs the same as a new one.
      const passwordHash = await hashPassword(password);
      const existing = await fastify.prisma.authAccount.findUnique({ where: { email } });

      let accountId: string;
      if (!existing) {
        accountId = newAccountId();
        await fastify.prisma.authAccount.create({
          data: { id: accountId, email, passwordHash, firstName, lastName },
        });
      } else if (existing.emailVerifiedAt) {
        return reply.status(202).send({ ok: true });
      } else {
        accountId = existing.id;
        await fastify.prisma.authAccount.update({
          where: { id: accountId },
          data: { passwordHash, firstName, lastName },
        });
      }

      const issued = await issueCode(fastify.prisma, { purpose: "email_verify", target: email, accountId });
      if (!("error" in issued)) {
        await sendCodeEmail(email, "email_verify", issued.code);
      }
      return reply.status(202).send({ ok: true });
    },
  );

  fastify.post<{ Body: VerifyBody }>(
    "/signup/verify",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email", "code", "client"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            code: { type: "string", minLength: 1, maxLength: 16 },
            client: { type: "string", enum: ["web", "mobile"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { code, client } = request.body;
      const email = normalizeEmail(request.body.email);

      const account = await fastify.prisma.authAccount.findUnique({ where: { email } });
      const result = await verifyCode(fastify.prisma, { purpose: "email_verify", target: email, code });
      if (!result.ok || !account || result.accountId !== account.id) {
        return reply.status(400).send(INVALID_CODE);
      }

      await fastify.prisma.authAccount.update({
        where: { id: account.id },
        data: { emailVerifiedAt: new Date() },
      });
      const session = await createSession(fastify.prisma, {
        accountId: account.id,
        client,
        typ: "user",
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      const deviceId = await trustDevice(fastify.prisma, account.id);
      return reply.send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        deviceId,
      });
    },
  );
};
