import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { issueCode, verifyCode } from "../codes.js";
import { trustDevice } from "../devices.js";
import { sendCodeEmailToAccount, sendPasswordChangedToAccount } from "../brand-mail.js";
import { normalizeEmail } from "../ids.js";
import { authClientIp, clearPasswordFailures, hitLimit, isLocked, recordPasswordFailure } from "../limits.js";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "../password.js";
import { createSession, revokeAllSessions } from "../sessions.js";
import { requireAccountSession } from "../account-auth.js";
import { BOT_CHECK_FAILED, passesBotCheck } from "../turnstile.js";

const MIN_DURATION_MS = 300;

const INVALID_CODE = {
  error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." },
};
const INVALID_CREDENTIALS = {
  error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
};
const WEAK_PASSWORD = { error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." } };
const UNAVAILABLE = { error: { code: "UNAVAILABLE", message: "Please try again." } };

/** Fire-and-forget work (mail sends, post-reply processing); tests await it via settlePasswordWork(). */
const pendingWork = new Set<Promise<void>>();
export async function settlePasswordWork(): Promise<void> {
  while (pendingWork.size > 0) await Promise.all([...pendingWork]);
}
function track(work: Promise<void>): void {
  pendingWork.add(work);
  void work.finally(() => pendingWork.delete(work));
}

function mailChanged(fastify: FastifyInstance, to: string): void {
  track(
    sendPasswordChangedToAccount(fastify.prisma, to).catch((err: unknown) => {
      fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "password changed email failed");
    }),
  );
}

async function padTo(startedAt: number): Promise<void> {
  const left = MIN_DURATION_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

async function bestEffort(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // ignored
  }
}

/** users row for the account, null when none; "error" when the lookup failed (callers must fail closed). */
async function userRow(fastify: FastifyInstance, accountId: string) {
  try {
    return await fastify.prisma.user.findUnique({ where: { id: accountId }, select: { role: true } });
  } catch {
    return "error" as const;
  }
}

/** Public, credential-limited routes (registered inside the per-IP limited plugin). */
export const passwordRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { email: string; turnstileToken?: string } }>(
    "/password/forgot",
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
      if (!(await passesBotCheck(request.headers, request.body.turnstileToken, authClientIp(request), hitLimit))) {
        return reply.status(400).send(BOT_CHECK_FAILED);
      }
      const email = normalizeEmail(request.body.email);
      // Same answer for every case, sent before any lookup; the real work happens afterwards.
      await reply.status(202).send({ ok: true });
      track(
        (async () => {
          try {
            const account = await fastify.prisma.authAccount.findUnique({ where: { email } });
            if (!account || account.status !== "active") return;
            if (!account.emailVerifiedAt && !account.mustSetPassword) return;
            const issued = await issueCode(fastify.prisma, {
              purpose: "password_reset",
              target: account.email,
              accountId: account.id,
            });
            if ("error" in issued) return;
            await sendCodeEmailToAccount(fastify.prisma, account.email, "password_reset", issued.code);
          } catch (err) {
            fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "password forgot failed");
          }
        })(),
      );
    },
  );

  fastify.post<{ Body: { email: string; code: string; newPassword: string; client?: "web" | "mobile" } }>(
    "/password/reset",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["email", "code", "newPassword"],
          properties: {
            email: { type: "string", minLength: 3, maxLength: 254 },
            code: { type: "string", minLength: 1, maxLength: 16 },
            newPassword: { type: "string", maxLength: 1024 },
            client: { type: "string", enum: ["web", "mobile"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const { code, newPassword, client } = request.body;
      const email = normalizeEmail(request.body.email);
      const db = fastify.prisma;

      if (!checkPasswordPolicy(newPassword).ok) return reply.status(400).send(WEAK_PASSWORD);

      const account = await db.authAccount.findUnique({ where: { email } });
      // Resolve the role before changing anything so a lookup fault cannot leave a half-done sign-in.
      const row = account && client ? await userRow(fastify, account.id) : null;
      if (row === "error") {
        await padTo(startedAt);
        return reply.status(503).send(UNAVAILABLE);
      }

      const result = await verifyCode(db, { purpose: "password_reset", target: email, code });
      if (!result.ok || !account || account.status !== "active") {
        await padTo(startedAt);
        return reply.status(400).send(INVALID_CODE);
      }

      const now = new Date();
      const passwordHash = await hashPassword(newPassword);
      // Revoke first: if this fails the password is unchanged; if the write below fails, old sessions are already dead.
      await revokeAllSessions(db, account.id, "password_reset");
      await db.authAccount.update({
        where: { id: account.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          mustSetPassword: false,
          // A reset code proves ownership of the mailbox.
          emailVerifiedAt: account.emailVerifiedAt ?? now,
        },
      });
      await bestEffort(() => clearPasswordFailures(account.id));
      mailChanged(fastify, account.email);

      if (!client) return reply.send({ ok: true });

      const isSuperAdmin = row?.role === "superAdmin";
      const session = await createSession(db, {
        accountId: account.id,
        client: isSuperAdmin ? "admin" : client,
        typ: isSuperAdmin ? "admin" : "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      const deviceId = await trustDevice(db, account.id);
      return reply.send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        deviceId,
      });
    },
  );
};

/** Authenticated route (outside the credential limiter). */
export const passwordChangeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { currentPassword?: string; newPassword: string } }>(
    "/password/change",
    {
      config: { public: true },
      preHandler: requireAccountSession,
      schema: {
        body: {
          type: "object",
          required: ["newPassword"],
          properties: {
            currentPassword: { type: "string", maxLength: 1024 },
            newPassword: { type: "string", maxLength: 1024 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { sid, accountId } = request.account!;
      const { currentPassword, newPassword } = request.body;
      const db = fastify.prisma;

      if (!checkPasswordPolicy(newPassword).ok) return reply.status(400).send(WEAK_PASSWORD);

      const account = await db.authAccount.findUnique({ where: { id: accountId } });
      if (!account || account.status !== "active") return reply.status(401).send(INVALID_CREDENTIALS);

      // A flagged account has no usable password yet, so there is nothing to confirm.
      if (!account.mustSetPassword) {
        if (await isLocked(account.id)) return reply.status(401).send(INVALID_CREDENTIALS);
        const result = await verifyPassword(currentPassword ?? "", account.passwordHash ?? "");
        if (!account.passwordHash || !currentPassword || !result.ok) {
          if (account.passwordHash) await bestEffort(() => recordPasswordFailure(account.id));
          return reply.status(401).send(INVALID_CREDENTIALS);
        }
        await bestEffort(() => clearPasswordFailures(account.id));
      }

      const passwordHash = await hashPassword(newPassword);
      await revokeAllSessions(db, account.id, "password_change", sid);
      await db.authAccount.update({
        where: { id: account.id },
        data: { passwordHash, passwordChangedAt: new Date(), mustSetPassword: false },
      });
      mailChanged(fastify, account.email);
      return reply.send({ ok: true });
    },
  );
};
