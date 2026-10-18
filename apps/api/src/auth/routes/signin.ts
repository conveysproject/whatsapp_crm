import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { issueCode, verifyCode, verifyCodeById, type CodePurpose } from "../codes.js";
import { isTrustedDevice, trustDevice } from "../devices.js";
import { sendCodeEmail } from "../emails.js";
import { normalizeEmail } from "../ids.js";
import {
  authClientIp,
  clearPasswordFailures,
  isLocked,
  recordPasswordFailure,
} from "../limits.js";
import { hashPassword, verifyPassword } from "../password.js";
import { createSession } from "../sessions.js";
import { BOT_CHECK_FAILED, verifyTurnstile } from "../turnstile.js";

interface SigninBody {
  email: string;
  password: string;
  client: "web" | "mobile";
  deviceId?: string;
}
interface CodeRequestBody {
  email: string;
  turnstileToken?: string;
}
interface CodeVerifyBody {
  email: string;
  code: string;
  client: "web" | "mobile";
}
interface NewDeviceBody {
  challengeId: string;
  code: string;
  client: "web" | "mobile";
}

const MIN_DURATION_MS = 300;
// Fixed argon2id hash (current params) of a throwaway string; verified for unknown accounts so timing matches.
export const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$UDOj3rd08ph1+wg/v49Qlg$D4n1j11jYPfZWc9vwh6D0i7Emf8mCSNwkunCitx9n3Y";

const INVALID_CREDENTIALS = {
  error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
};
const INVALID_CODE = {
  error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." },
};
const RATE_LIMITED = {
  error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
};

/** Fire-and-forget mail sends; tests await them via settleSigninWork(). */
const pendingSigninWork = new Set<Promise<void>>();
export async function settleSigninWork(): Promise<void> {
  while (pendingSigninWork.size > 0) await Promise.all([...pendingSigninWork]);
}

function mailInBackground(fastify: FastifyInstance, to: string, purpose: CodePurpose, code: string): void {
  const work = sendCodeEmail(to, purpose, code).catch((err: unknown) => {
    fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "signin code email failed");
  });
  pendingSigninWork.add(work);
  void work.finally(() => pendingSigninWork.delete(work));
}

/** A Redis hiccup must not turn a sign-in answer into a 500. */
export async function bestEffort(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // ignored
  }
}

export async function padTo(startedAt: number): Promise<void> {
  const left = MIN_DURATION_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

/** users row for the account, null when none; "error" when the lookup failed (callers must fail closed). */
export async function userRow(fastify: FastifyInstance, accountId: string) {
  try {
    return await fastify.prisma.user.findUnique({
      where: { id: accountId },
      select: { role: true, organizationId: true },
    });
  } catch {
    return "error" as const;
  }
}

export const UNAVAILABLE = { error: { code: "UNAVAILABLE", message: "Please try again." } };

export async function logAttempt(
  fastify: FastifyInstance,
  request: FastifyRequest,
  input: { userId: string; orgId: string | null; success: boolean; method?: string },
): Promise<void> {
  try {
    await fastify.prisma.loginLog.create({
      data: {
        userId: input.userId,
        orgId: input.orgId,
        method: input.method ?? "password",
        success: input.success,
        ipAddress: authClientIp(request),
        userAgent: request.headers["user-agent"] ?? null,
      },
    });
  } catch (err) {
    fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "login log write failed");
  }
}

export const signinRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SigninBody }>(
    "/signin/password",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email", "password", "client"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            password: { type: "string", maxLength: 1024 },
            client: { type: "string", enum: ["web", "mobile"] },
            deviceId: { type: "string", maxLength: 200 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const { password, client, deviceId } = request.body;
      const email = normalizeEmail(request.body.email);
      const db = fastify.prisma;

      const fail = async (userId: string, orgId: string | null) => {
        await logAttempt(fastify, request, { userId, orgId, success: false });
        await padTo(startedAt);
        return reply.status(401).send(INVALID_CREDENTIALS);
      };

      const account = await db.authAccount.findUnique({ where: { email } });
      if (!account) {
        await verifyPassword(password, DUMMY_HASH);
        return fail("unknown", null);
      }
      const locked = await isLocked(account.id);
      const rowOrErr = await userRow(fastify, account.id);
      if (rowOrErr === "error") {
        await padTo(startedAt);
        return reply.status(503).send(UNAVAILABLE);
      }
      const row = rowOrErr;
      const orgId = row?.organizationId ?? null;

      // Account flagged to set a password: the typed password is ignored and never verified.
      if (account.mustSetPassword && account.emailVerifiedAt && account.status === "active" && !locked) {
        const issued = await issueCode(db, { purpose: "password_reset", target: account.email, accountId: account.id });
        await padTo(startedAt);
        if ("error" in issued) return reply.status(429).send(RATE_LIMITED);
        mailInBackground(fastify, account.email, "password_reset", issued.code);
        return reply.send({ next: "set_password", challengeId: issued.codeId });
      }

      const result = await verifyPassword(password, account.passwordHash ?? DUMMY_HASH);
      if (locked || !result.ok || !account.passwordHash || !account.emailVerifiedAt || account.status !== "active") {
        // Locked attempts are not counted again, so an attacker cannot extend a victim's lock indefinitely.
        if (!locked && account.passwordHash && !result.ok) {
          await bestEffort(() => recordPasswordFailure(account.id));
        }
        return fail(account.id, orgId);
      }

      // Re-check after the slow verify: a concurrent burst may have locked the account meanwhile.
      if (await isLocked(account.id)) return fail(account.id, orgId);

      if (result.needsRehash) {
        try {
          await db.authAccount.update({
            where: { id: account.id },
            data: { passwordHash: await hashPassword(password) },
          });
        } catch {
          // best effort; the old hash still verifies
        }
      }

      const isSuperAdmin = row?.role === "superAdmin";
      const trusted = !isSuperAdmin && (await isTrustedDevice(db, account.id, deviceId));

      if (!trusted) {
        // Second factor still pending: log it as such and keep the failure counter until it completes.
        await logAttempt(fastify, request, { userId: account.id, orgId, success: true, method: "password_pending" });
        const issued = await issueCode(db, { purpose: "new_device", target: account.email, accountId: account.id });
        if ("error" in issued) return reply.status(429).send(RATE_LIMITED);
        mailInBackground(fastify, account.email, "new_device", issued.code);
        return reply.send({ next: "new_device", challengeId: issued.codeId });
      }

      await bestEffort(() => clearPasswordFailures(account.id));
      await logAttempt(fastify, request, { userId: account.id, orgId, success: true });
      const session = await createSession(db, {
        accountId: account.id,
        client,
        typ: "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      return reply.send({ accessToken: session.accessToken, refreshToken: session.refreshToken, expiresIn: 600 });
    },
  );

  fastify.post<{ Body: NewDeviceBody }>(
    "/signin/new-device",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["challengeId", "code", "client"],
          properties: {
            challengeId: { type: "string", minLength: 1, maxLength: 64 },
            code: { type: "string", minLength: 1, maxLength: 16 },
            client: { type: "string", enum: ["web", "mobile"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { challengeId, code, client } = request.body;
      const db = fastify.prisma;

      const result = await verifyCodeById(db, { codeId: challengeId, purpose: "new_device", code });
      if (!result.ok || !result.accountId) return reply.status(400).send(INVALID_CODE);
      const account = await db.authAccount.findUnique({ where: { id: result.accountId } });
      // Re-check everything the password step required: the account may have changed since the code was sent.
      if (
        !account ||
        account.status !== "active" ||
        !account.emailVerifiedAt ||
        account.mustSetPassword ||
        (await isLocked(account.id))
      ) {
        return reply.status(400).send(INVALID_CODE);
      }

      const row = await userRow(fastify, account.id);
      if (row === "error") return reply.status(503).send(UNAVAILABLE);
      const isSuperAdmin = row?.role === "superAdmin";
      const session = await createSession(db, {
        accountId: account.id,
        client: isSuperAdmin ? "admin" : client,
        typ: isSuperAdmin ? "admin" : "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      await bestEffort(() => clearPasswordFailures(account.id));
      await logAttempt(fastify, request, {
        userId: account.id,
        orgId: row?.organizationId ?? null,
        success: true,
        method: "new_device",
      });
      const newDeviceId = await trustDevice(db, account.id);
      return reply.send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        deviceId: newDeviceId,
      });
    },
  );

  fastify.post<{ Body: CodeRequestBody }>(
    "/signin/code/request",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            turnstileToken: { type: "string", maxLength: 2048 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!(await verifyTurnstile(request.body.turnstileToken, authClientIp(request)))) {
        return reply.status(400).send(BOT_CHECK_FAILED);
      }
      const email = normalizeEmail(request.body.email);
      // Always the same answer, sent before any lookup; the real work happens afterwards.
      await reply.status(202).send({ ok: true });
      const work = (async () => {
        try {
          const account = await fastify.prisma.authAccount.findUnique({ where: { email } });
          if (!account || !account.emailVerifiedAt || account.status !== "active") return;
          if (await isLocked(account.id)) return;
          const issued = await issueCode(fastify.prisma, {
            purpose: "signin_email",
            target: account.email,
            accountId: account.id,
          });
          if ("error" in issued) return;
          await sendCodeEmail(account.email, "signin_email", issued.code);
        } catch (err) {
          fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "signin code request failed");
        }
      })();
      pendingSigninWork.add(work);
      void work.finally(() => pendingSigninWork.delete(work));
    },
  );

  fastify.post<{ Body: CodeVerifyBody }>(
    "/signin/code/verify",
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
      const startedAt = Date.now();
      const { code, client } = request.body;
      const email = normalizeEmail(request.body.email);
      const db = fastify.prisma;
      const log = (userId: string, orgId: string | null, success: boolean) =>
        logAttempt(fastify, request, { userId, orgId, success, method: "email_code" });
      const invalid = async (userId: string, orgId: string | null) => {
        await log(userId, orgId, false);
        await padTo(startedAt);
        return reply.status(400).send(INVALID_CODE);
      };

      const result = await verifyCode(db, { purpose: "signin_email", target: email, code });
      // Always look the account up (even for a bad code) so timing and log attribution do not depend on the code result.
      const account = await db.authAccount.findUnique({ where: { email } });
      const rowOrErr = account ? await userRow(fastify, account.id) : null;
      if (rowOrErr === "error") {
        await padTo(startedAt);
        return reply.status(503).send(UNAVAILABLE);
      }
      const orgId = rowOrErr?.organizationId ?? null;
      if (!result.ok || !account || account.status !== "active" || !account.emailVerifiedAt) {
        return invalid(account?.id ?? "unknown", orgId);
      }

      // A code alone must not bypass a password lock.
      if (await isLocked(account.id)) {
        await log(account.id, orgId, false);
        await padTo(startedAt);
        return reply.status(401).send(INVALID_CREDENTIALS);
      }

      const isSuperAdmin = rowOrErr?.role === "superAdmin";
      const session = await createSession(db, {
        accountId: account.id,
        client: isSuperAdmin ? "admin" : client,
        typ: isSuperAdmin ? "admin" : "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      const deviceId = await trustDevice(db, account.id);
      await log(account.id, orgId, true);
      return reply.send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        deviceId,
        ...(account.mustSetPassword ? { mustSetPassword: true } : {}),
      });
    },
  );
};
