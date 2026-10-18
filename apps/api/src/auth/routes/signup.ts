import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { issueCode, verifyCode } from "../codes.js";
import { trustDevice } from "../devices.js";
import { sendCodeEmail } from "../emails.js";
import { newAccountId, normalizeEmail } from "../ids.js";
import { checkPasswordPolicy, hashPassword } from "../password.js";
import { authClientIp } from "../limits.js";
import { deletePendingSignup, loadPendingSignup, savePendingSignup } from "../pending-signup.js";
import { createSession } from "../sessions.js";
import { BOT_CHECK_FAILED, verifyTurnstile } from "../turnstile.js";
import { BUSINESS_SCHEMA, createWorkspace, type BusinessInput } from "../../lib/create-workspace.js";

interface SignupBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  business: BusinessInput;
  turnstileToken?: string;
}
interface VerifyBody {
  signupId: string;
  email: string;
  code: string;
  client: "web" | "mobile";
}

const MIN_DURATION_MS = 300;
async function padTo(startedAt: number): Promise<void> {
  const left = MIN_DURATION_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

/** Background signup work in flight; tests await it via settleSignupWork(). */
const pendingSignupWork = new Set<Promise<void>>();
export async function settleSignupWork(): Promise<void> {
  while (pendingSignupWork.size > 0) await Promise.all([...pendingSignupWork]);
}

/** A unique violation on the auth account email (not some other unique index). */
function isEmailUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null || (err as { code?: unknown }).code !== "P2002") return false;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.includes("email") : typeof target === "string" && target.includes("email");
}

/**
 * Nothing is written to the database here: the sign-up is parked in Redis under a random signupId that
 * only the originating browser receives, until the email code is verified. Several pending entries per
 * email may coexist; verify requires the signupId, so another party's entry can never become the account.
 */
async function processSignup(
  fastify: FastifyInstance,
  input: { signupId: string; email: string; password: string; firstName: string; lastName: string; business: BusinessInput },
): Promise<void> {
  const { signupId, email, password, firstName, lastName, business } = input;
  const db = fastify.prisma;
  const account = await db.authAccount.findUnique({ where: { email } });
  if (account?.emailVerifiedAt) return;

  // Issue the code first: when throttled, nothing is stored (a bot cannot fill Redis) and nothing is sent.
  const issued = await issueCode(db, { purpose: "email_verify", target: email });
  if ("error" in issued) return;

  const passwordHash = await hashPassword(password);
  await savePendingSignup(signupId, { email, passwordHash, firstName, lastName, business });
  await sendCodeEmail(email, "email_verify", issued.code);
}

const INVALID_CODE = {
  error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." },
};
const SIGNUP_EXPIRED = {
  error: { code: "SIGNUP_EXPIRED", message: "Your sign-up expired. Please start again." },
};

export const signupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SignupBody }>(
    "/signup",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "firstName", "lastName", "business"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            password: { type: "string" },
            firstName: { type: "string", minLength: 1, maxLength: 100 },
            lastName: { type: "string", minLength: 1, maxLength: 100 },
            business: {
              type: "object",
              required: ["companyName", "industry", "revenue"],
              properties: { ...BUSINESS_SCHEMA },
              additionalProperties: false,
            },
            turnstileToken: { type: "string", maxLength: 2048 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { password, firstName, lastName, business } = request.body;
      const email = normalizeEmail(request.body.email);

      if (!(await verifyTurnstile(request.body.turnstileToken, authClientIp(request)))) {
        return reply.status(400).send(BOT_CHECK_FAILED);
      }

      if (!checkPasswordPolicy(password).ok) {
        return reply.status(400).send({
          error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." },
        });
      }

      // Every branch answers identically and immediately; the real work runs after the reply so
      // neither status nor timing reveals whether the email already exists.
      // The signupId is generated for every request (stored only when real) so replies look identical.
      const signupId = randomBytes(16).toString("base64url");
      reply.status(202).send({ ok: true, signupId });
      const work = processSignup(fastify, { signupId, email, password, firstName, lastName, business }).catch((err: unknown) => {
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
          required: ["signupId", "email", "code", "client"],
          properties: {
            signupId: { type: "string", minLength: 1, maxLength: 64 },
            email: { type: "string", minLength: 3, maxLength: 254 },
            code: { type: "string", minLength: 1, maxLength: 16 },
            client: { type: "string", enum: ["web", "mobile"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const { signupId, code, client } = request.body;
      const email = normalizeEmail(request.body.email);
      const fail = async (body: typeof INVALID_CODE) => {
        await padTo(startedAt);
        return reply.status(400).send(body);
      };

      // verifyCode consumes the code atomically, so only one concurrent request gets past this line.
      const result = await verifyCode(fastify.prisma, { purpose: "email_verify", target: email, code });
      if (!result.ok) return fail(INVALID_CODE);

      const pending = await loadPendingSignup(signupId);
      if (!pending) return fail(SIGNUP_EXPIRED);
      // The entry must belong to this email: a signupId from another sign-up never creates this account.
      if (pending.email !== email) return fail(INVALID_CODE);

      // Someone registered this email since sign-up started: never touch the existing account.
      if (await fastify.prisma.authAccount.findUnique({ where: { email } })) {
        await deletePendingSignup(signupId);
        return fail(INVALID_CODE);
      }

      const accountId = newAccountId();
      const fullName = [pending.firstName, pending.lastName].filter(Boolean).join(" ") || email;
      let organizationId: string;
      try {
        ({ organizationId } = await fastify.prisma.$transaction(async (tx) => {
          await tx.authAccount.create({
            data: {
              id: accountId,
              email,
              passwordHash: pending.passwordHash,
              firstName: pending.firstName,
              lastName: pending.lastName,
              emailVerifiedAt: new Date(),
            },
          });
          return createWorkspace(tx, { userId: accountId, email, fullName, business: pending.business });
        }));
      } catch (err) {
        if (!isEmailUniqueViolation(err)) throw err;
        request.log.warn({ reason: "signup_email_conflict" }, "sign-up verify hit an existing email");
        await deletePendingSignup(signupId);
        return fail(INVALID_CODE);
      }
      await deletePendingSignup(signupId);

      const session = await createSession(fastify.prisma, {
        accountId,
        client,
        typ: "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      const deviceId = await trustDevice(fastify.prisma, accountId);
      return reply.send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        ...(deviceId ? { deviceId } : {}),
        organizationId,
      });
    },
  );
};
