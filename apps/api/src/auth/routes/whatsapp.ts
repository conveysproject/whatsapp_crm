import type { FastifyPluginAsync } from "fastify";
import { requireAccountSession } from "../account-auth.js";
import { issueCode, verifyCode } from "../codes.js";
import { authClientIp, hitLimit, isLocked } from "../limits.js";
import { toE164 } from "../phone.js";
import { BOT_CHECK_FAILED, verifyTurnstile } from "../turnstile.js";
import { startUserSession } from "../user-session.js";
import { lockAccount } from "../account-lock.js";
import { sendWhatsappCode, whatsappAuthConfig, whatsappDailyCapHit } from "../whatsapp-codes.js";
import { UNAVAILABLE, logAttempt, padTo, userRow } from "./signin.js";

const DISABLED = { error: { code: "FEATURE_DISABLED", message: "WhatsApp sign-in is not available." } };
const INVALID_PHONE = {
  error: {
    code: "INVALID_PHONE",
    message: "Enter your full WhatsApp number with the country code, for example +91 98765 43210.",
  },
};
const INVALID_CODE = { error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." } };
const INVALID_CREDENTIALS = { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } };
const RATE_LIMITED = { error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." } };
const SEND_FAILED = {
  error: {
    code: "WHATSAPP_SEND_FAILED",
    message: "We couldn't send a WhatsApp message to that number. Check the number and try again.",
  },
};
const PHONE_IN_USE = {
  error: { code: "PHONE_IN_USE", message: "This number is already linked to another account." },
};

const LATER = { error: { code: "RATE_LIMITED", message: "Please try again later." } };
const LAST_METHOD = {
  error: {
    code: "LAST_SIGN_IN_METHOD",
    message: "This is your only way to sign in. Set a password or connect another option before removing it.",
  },
};

const PHONE = { type: "string", minLength: 4, maxLength: 40 } as const;
const CODE = { type: "string", minLength: 1, maxLength: 16 } as const;

/** Background WhatsApp sends in flight; tests await them via settleWhatsappWork(). */
const pendingWork = new Set<Promise<void>>();
export async function settleWhatsappWork(): Promise<void> {
  while (pendingWork.size > 0) await Promise.all([...pendingWork]);
}

const isP2002 = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";

/** Public: WhatsApp code sign-in for accounts with a verified number. Registered under the credential limiter. */
export const whatsappSigninRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { phone: string; turnstileToken?: string } }>(
    "/signin/whatsapp/request",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["phone"],
          properties: { phone: PHONE, turnstileToken: { type: "string", maxLength: 2048 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!whatsappAuthConfig()) return reply.status(404).send(DISABLED);
      if (!(await verifyTurnstile(request.body.turnstileToken, authClientIp(request)))) {
        return reply.status(400).send(BOT_CHECK_FAILED);
      }
      // A format check only: it says nothing about whether an account uses the number.
      const phone = toE164(request.body.phone);
      if (!phone) return reply.status(400).send(INVALID_PHONE);

      // Same answer for every number, sent before any lookup.
      await reply.status(202).send({ ok: true });
      const work = (async () => {
        try {
          const db = fastify.prisma;
          const account = await db.authAccount.findUnique({ where: { phoneE164: phone } });
          if (!account?.phoneVerifiedAt || !account.emailVerifiedAt || account.status !== "active") return;
          if (await isLocked(account.id)) return;
          const row = await userRow(fastify, account.id);
          if (row === "error" || row?.role === "superAdmin") return;
          // Global daily budget: past it, sign-in codes are silently skipped (the reply was already 202).
          if (await whatsappDailyCapHit()) {
            fastify.log.warn({ reason: "whatsapp_daily_cap" }, "auth WhatsApp daily cap reached; sign-in code skipped");
            return;
          }
          const issued = await issueCode(db, { purpose: "signin_whatsapp", target: phone, accountId: account.id });
          if ("error" in issued) return;
          await sendWhatsappCode(db, phone, issued.code);
        } catch (err) {
          fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "whatsapp signin code failed");
        }
      })();
      pendingWork.add(work);
      void work.finally(() => pendingWork.delete(work));
    },
  );

  fastify.post<{ Body: { phone: string; code: string; client: "web" | "mobile" } }>(
    "/signin/whatsapp/verify",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["phone", "code", "client"],
          properties: { phone: PHONE, code: CODE, client: { type: "string", enum: ["web", "mobile"] } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!whatsappAuthConfig()) return reply.status(404).send(DISABLED);
      const startedAt = Date.now();
      const db = fastify.prisma;
      const log = (userId: string, orgId: string | null, success: boolean) =>
        logAttempt(fastify, request, { userId, orgId, success, method: "whatsapp_code" });
      const invalid = async (userId: string, orgId: string | null) => {
        await log(userId, orgId, false);
        await padTo(startedAt);
        return reply.status(400).send(INVALID_CODE);
      };

      const phone = toE164(request.body.phone);
      if (!phone) return invalid("unknown", null);
      const result = await verifyCode(db, { purpose: "signin_whatsapp", target: phone, code: request.body.code });
      // Always look the account up so timing does not depend on the code result.
      const account = await db.authAccount.findUnique({ where: { phoneE164: phone } });
      const row = account ? await userRow(fastify, account.id) : null;
      if (row === "error") {
        await padTo(startedAt);
        return reply.status(503).send(UNAVAILABLE);
      }
      const orgId = row?.organizationId ?? null;
      if (
        !result.ok ||
        !account ||
        result.accountId !== account.id ||
        !account.phoneVerifiedAt ||
        !account.emailVerifiedAt ||
        account.status !== "active" ||
        row?.role === "superAdmin"
      ) {
        return invalid(account?.id ?? "unknown", orgId);
      }
      // A code alone must not bypass a password lock.
      if (await isLocked(account.id)) {
        await log(account.id, orgId, false);
        await padTo(startedAt);
        return reply.status(401).send(INVALID_CREDENTIALS);
      }

      const session = await startUserSession(fastify, request, account.id, request.body.client);
      await log(account.id, orgId, true);
      return reply.send({ ...session, ...(account.mustSetPassword ? { mustSetPassword: true } : {}) });
    },
  );
};

/** Authenticated (account session): add, confirm or remove the account's WhatsApp number. Scoped to request.account. */
export const phoneRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { phone: string; turnstileToken?: string } }>(
    "/phone/verify/request",
    {
      config: { public: true },
      preHandler: requireAccountSession,
      schema: {
        body: {
          type: "object",
          required: ["phone"],
          properties: { phone: PHONE, turnstileToken: { type: "string", maxLength: 2048 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!whatsappAuthConfig()) return reply.status(404).send(DISABLED);
      const { accountId } = request.account!;
      if (!(await verifyTurnstile(request.body.turnstileToken, authClientIp(request)))) {
        return reply.status(400).send(BOT_CHECK_FAILED);
      }
      const phone = toE164(request.body.phone);
      if (!phone) return reply.status(400).send(INVALID_PHONE);
      // Each send costs money: cap per account and per IP on top of the per-number code throttle.
      if (
        (await hitLimit(`auth:phonev:acct:${accountId}`, 5, 3600)) ||
        (await hitLimit(`auth:phonev:ip:${authClientIp(request)}`, 10, 3600))
      ) {
        return reply.status(429).send(RATE_LIMITED);
      }
      if (await whatsappDailyCapHit()) {
        fastify.log.warn({ reason: "whatsapp_daily_cap" }, "auth WhatsApp daily cap reached; phone verification refused");
        return reply.status(429).send(LATER);
      }
      const issued = await issueCode(fastify.prisma, { purpose: "phone_verify", target: phone, accountId });
      if ("error" in issued) return reply.status(429).send(RATE_LIMITED);
      // Synchronous on purpose: the signed-in user is checking their own number and needs to know if delivery failed.
      try {
        await sendWhatsappCode(fastify.prisma, phone, issued.code);
      } catch (err) {
        fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "phone verify send failed");
        return reply.status(502).send(SEND_FAILED);
      }
      return reply.send({ ok: true });
    },
  );

  fastify.post<{ Body: { phone: string; code: string } }>(
    "/phone/verify/confirm",
    {
      config: { public: true },
      preHandler: requireAccountSession,
      schema: {
        body: {
          type: "object",
          required: ["phone", "code"],
          properties: { phone: PHONE, code: CODE },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!whatsappAuthConfig()) return reply.status(404).send(DISABLED);
      const { accountId } = request.account!;
      const phone = toE164(request.body.phone);
      if (!phone) return reply.status(400).send(INVALID_CODE);
      const result = await verifyCode(fastify.prisma, { purpose: "phone_verify", target: phone, code: request.body.code });
      // The code must have been issued to this account: another account's code for the same number never counts.
      if (!result.ok || result.accountId !== accountId) return reply.status(400).send(INVALID_CODE);
      try {
        await fastify.prisma.$transaction(async (tx) => {
          // A proven number wins over a stale, never-verified claim on another account.
          await tx.authAccount.updateMany({
            where: { phoneE164: phone, phoneVerifiedAt: null, NOT: { id: accountId } },
            data: { phoneE164: null },
          });
          await tx.authAccount.update({
            where: { id: accountId },
            data: { phoneE164: phone, phoneVerifiedAt: new Date() },
          });
        });
      } catch (err) {
        if (isP2002(err)) return reply.status(409).send(PHONE_IN_USE);
        throw err;
      }
      return reply.send({ phone: { e164: phone, verified: true } });
    },
  );

  fastify.delete("/phone", { config: { public: true }, preHandler: requireAccountSession }, async (request, reply) => {
    if (!whatsappAuthConfig()) return reply.status(404).send(DISABLED);
    const { accountId } = request.account!;
    // Check and clear under a row lock so a concurrent unlink cannot remove the last other method meanwhile.
    const outcome = await fastify.prisma.$transaction(async (tx) => {
      await lockAccount(tx, accountId);
      const account = await tx.authAccount.findUnique({
        where: { id: accountId },
        select: { passwordHash: true, mustSetPassword: true, phoneVerifiedAt: true, oauthLinks: { select: { provider: true } } },
      });
      if (!account) return "missing" as const;
      const others = account.oauthLinks.length + (account.passwordHash && !account.mustSetPassword ? 1 : 0);
      if (account.phoneVerifiedAt && others === 0) return "last" as const;
      await tx.authAccount.update({ where: { id: accountId }, data: { phoneE164: null, phoneVerifiedAt: null } });
      return "ok" as const;
    });
    if (outcome === "missing") return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Account not found" } });
    if (outcome === "last") return reply.status(409).send(LAST_METHOD);
    return reply.send({ ok: true });
  });
};
