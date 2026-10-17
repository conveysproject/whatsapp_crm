import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { issueCode, verifyCode } from "../codes.js";
import { trustDevice } from "../devices.js";
import { sendCodeEmail } from "../emails.js";
import { newAccountId, normalizeEmail } from "../ids.js";
import { checkPasswordPolicy, hashPassword } from "../password.js";
import { authClientIp, isLocked } from "../limits.js";
import { UNAVAILABLE, userRow } from "./signin.js";
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

/** Background signup work in flight; tests await it via settleSignupWork(). */
const pendingSignupWork = new Set<Promise<void>>();
export async function settleSignupWork(): Promise<void> {
  while (pendingSignupWork.size > 0) await Promise.all([...pendingSignupWork]);
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

async function processSignup(
  fastify: FastifyInstance,
  input: { email: string; password: string; firstName: string; lastName: string },
): Promise<void> {
  const { email, password, firstName, lastName } = input;
  const db = fastify.prisma;
  let account = await db.authAccount.findUnique({ where: { email } });
  if (!account) {
    const passwordHash = await hashPassword(password);
    const id = newAccountId();
    try {
      account = await db.authAccount.create({ data: { id, email, passwordHash, firstName, lastName } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Lost a race with a concurrent signup: treat as the existing-account path.
      account = await db.authAccount.findUnique({ where: { email } });
      if (!account) return;
    }
  }
  // Existing accounts never have password/names overwritten (pre-account hijack); verified ones get nothing.
  if (account.emailVerifiedAt) return;

  const issued = await issueCode(db, { purpose: "email_verify", target: email, accountId: account.id });
  if ("error" in issued) return;
  await sendCodeEmail(email, "email_verify", issued.code);
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

      // Every branch answers identically and immediately; the real work runs after the reply so
      // neither status nor timing reveals whether the email already exists.
      reply.status(202).send({ ok: true });
      const work = processSignup(fastify, { email, password, firstName, lastName }).catch((err: unknown) => {
        fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "signup background work failed");
      });
      pendingSignupWork.add(work);
      void work.finally(() => pendingSignupWork.delete(work));
      return reply;
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

      if (account.status !== "active" || (await isLocked(account.id))) {
        return reply.status(400).send(INVALID_CODE);
      }
      const row = await userRow(fastify, account.id);
      if (row === "error") return reply.status(503).send(UNAVAILABLE);
      const isSuperAdmin = row?.role === "superAdmin";

      await fastify.prisma.authAccount.update({
        where: { id: account.id },
        data: { emailVerifiedAt: new Date() },
      });
      const session = await createSession(fastify.prisma, {
        accountId: account.id,
        client: isSuperAdmin ? "admin" : client,
        typ: isSuperAdmin ? "admin" : "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      const deviceId = isSuperAdmin ? undefined : await trustDevice(fastify.prisma, account.id);
      return reply.send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        ...(deviceId ? { deviceId } : {}),
      });
    },
  );
};
