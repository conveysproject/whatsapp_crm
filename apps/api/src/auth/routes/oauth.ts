import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { AuthAccount } from "@prisma/client";
import { requireAccountSession } from "../account-auth.js";
import { issueCode, verifyCodeById } from "../codes.js";
import { sendCodeEmail } from "../emails.js";
import { newAccountId, normalizeEmail } from "../ids.js";
import { isLocked } from "../limits.js";
import { getOAuthProvider } from "../oauth/registry.js";
import {
  consumeOAuthState,
  deletePendingOAuth,
  loadPendingOAuth,
  newOpaqueId,
  pkceChallenge,
  safeRelativePath,
  saveOAuthState,
  savePendingOAuth,
  type PendingOAuth,
} from "../oauth/state.js";
import { OAuthError, oauthRedirectUri, type OAuthIdentity, type OAuthProvider, type OAuthProviderId } from "../oauth/types.js";
import { startUserSession } from "../user-session.js";
import { whatsappAuthConfig } from "../whatsapp-codes.js";
import { UNAVAILABLE, bestEffort, logAttempt, padTo, userRow } from "./signin.js";

type Intent = "signin" | "link";
const err = (code: string, message: string) => ({ error: { code, message } });

const DISABLED = err("FEATURE_DISABLED", "This sign-in option is not available.");
const STATE_INVALID = err("OAUTH_STATE_INVALID", "This sign-in link expired. Please try again.");
const FAILED = (label: string) => err("OAUTH_FAILED", `We couldn't sign you in with ${label}. Please try again or use another way.`);
const NOT_ALLOWED = err("OAUTH_NOT_ALLOWED", "This account can't use this sign-in option. Sign in with your email instead.");
const ALREADY_LINKED = (label: string) =>
  err("OAUTH_ALREADY_LINKED", `That ${label} account is already connected to a different WBMSG account.`);
const PROVIDER_TAKEN = (label: string) =>
  err("OAUTH_PROVIDER_CONFLICT", `Your WBMSG account is already connected to a different ${label} account. Remove it first.`);
const EXPIRED = err("OAUTH_EXPIRED", "This sign-in expired. Please start again.");
const INVALID_CODE = err("INVALID_CODE", "That code is not valid. Request a new one.");
const INVALID_EMAIL = err("INVALID_EMAIL", "Enter a valid email address.");
const LAST_METHOD = err(
  "LAST_SIGN_IN_METHOD",
  "This is your only way to sign in. Set a password or connect another option before removing it.",
);
const NOT_LINKED = err("NOT_LINKED", "This sign-in option is not connected.");

const PROVIDER_PARAMS = {
  type: "object",
  required: ["provider"],
  properties: { provider: { type: "string", enum: ["google", "facebook"] } },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validEmail = (e: string | null): e is string => !!e && e.length <= 254 && EMAIL_RE.test(e);
const name = (v: string | null) => (v ? v.slice(0, 100) : null);

/** "pa***@gmail.com": enough for the person to recognise their address, without printing it in full. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

function isP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/** Background code emails in flight; tests await them via settleOAuthWork(). */
const pendingWork = new Set<Promise<void>>();
export async function settleOAuthWork(): Promise<void> {
  while (pendingWork.size > 0) await Promise.all([...pendingWork]);
}

type Fail = { status: number; body: ReturnType<typeof err> };

/** Shared by the callback and the pending-email routes: everything after we know which account to use. */
function flows(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const db = fastify.prisma;

  /** Account may sign in with a provider: active, not locked, and not a super admin. Returns its users row. */
  async function gate(
    account: Pick<AuthAccount, "id" | "status">,
    label: string,
  ): Promise<{ fail: Fail } | { row: { role: string; organizationId: string } | null }> {
    if (account.status !== "active" || (await isLocked(account.id))) return { fail: { status: 403, body: FAILED(label) } };
    const row = await userRow(fastify, account.id);
    if (row === "error") return { fail: { status: 503, body: UNAVAILABLE as ReturnType<typeof err> } };
    if (row?.role === "superAdmin") return { fail: { status: 403, body: NOT_ALLOWED } };
    return { row };
  }

  async function signIn(accountId: string, provider: OAuthProvider, redirectUrl: string, intent: Intent = "signin") {
    const account = await db.authAccount.findUnique({ where: { id: accountId } });
    if (!account) return reply.status(403).send({ ...FAILED(provider.label), intent });
    const g = await gate(account, provider.label);
    if ("fail" in g) return reply.status(g.fail.status).send({ ...g.fail.body, intent });
    const { row } = g;
    const session = await startUserSession(fastify, request, account.id, "web");
    await logAttempt(fastify, request, {
      userId: account.id,
      orgId: row?.organizationId ?? null,
      success: true,
      method: `oauth_${provider.id}`,
    });
    return reply.send({
      result: "session",
      ...session,
      // New social accounts have no workspace yet; the web sends them to /business-details.
      needsWorkspace: row === null,
      redirectUrl,
      ...(account.mustSetPassword ? { mustSetPassword: true } : {}),
    });
  }

  /** Links the identity to an existing account (proven to own the email) and signs in. */
  async function linkExistingAndSignIn(account: AuthAccount, provider: OAuthProvider, identity: { sub: string; email: string | null }, redirectUrl: string) {
    const g = await gate(account, provider.label);
    if ("fail" in g) return reply.status(g.fail.status).send({ ...g.fail.body, intent: "signin" });
    try {
      await db.authOAuthLink.create({
        data: { accountId: account.id, provider: provider.id, providerSub: identity.sub, emailAtLink: identity.email },
      });
    } catch (e) {
      if (!isP2002(e)) throw e;
      return reply.status(409).send({ ...PROVIDER_TAKEN(provider.label), intent: "signin" });
    }
    if (!account.emailVerifiedAt) {
      await db.authAccount.update({ where: { id: account.id }, data: { emailVerifiedAt: new Date() } });
    }
    return signIn(account.id, provider, redirectUrl);
  }

  /** New account with a verified email, no password and no workspace yet. */
  async function createAndSignIn(
    provider: OAuthProvider,
    input: { sub: string; email: string; firstName: string | null; lastName: string | null },
    redirectUrl: string,
  ) {
    const accountId = newAccountId();
    try {
      await db.$transaction(async (tx) => {
        await tx.authAccount.create({
          data: {
            id: accountId,
            email: input.email,
            emailVerifiedAt: new Date(),
            firstName: name(input.firstName),
            lastName: name(input.lastName),
          },
        });
        await tx.authOAuthLink.create({
          data: { accountId, provider: provider.id, providerSub: input.sub, emailAtLink: input.email },
        });
      });
    } catch (e) {
      // Lost a race with another sign-up for the same email or identity: never touch that account here.
      if (!isP2002(e)) throw e;
      request.log.warn({ reason: "oauth_create_conflict" }, "oauth account create hit an existing row");
      return reply.status(409).send({ ...FAILED(provider.label), intent: "signin" });
    }
    return signIn(accountId, provider, redirectUrl);
  }

  /** Sign-in with a provider identity we have not seen: PRD §4.6 linking rules. */
  async function signInWithIdentity(provider: OAuthProvider, identity: OAuthIdentity, redirectUrl: string) {
    const email = identity.email ? normalizeEmail(identity.email) : null;
    // Only Google vouches for the email; everything else proves the address with an email code first.
    if (provider.id === "google" && identity.emailVerified && validEmail(email)) {
      const existing = await db.authAccount.findUnique({ where: { email } });
      if (existing) return linkExistingAndSignIn(existing, provider, { sub: identity.sub, email }, redirectUrl);
      return createAndSignIn(provider, { sub: identity.sub, email, firstName: identity.firstName, lastName: identity.lastName }, redirectUrl);
    }
    const pendingId = newOpaqueId();
    const pending: PendingOAuth = {
      provider: provider.id,
      sub: identity.sub,
      email: validEmail(email) ? email : null,
      firstName: identity.firstName,
      lastName: identity.lastName,
      redirectUrl,
    };
    await savePendingOAuth(pendingId, pending);
    return reply.send({
      result: "confirm_email",
      pendingId,
      provider: provider.id,
      email: pending.email ? maskEmail(pending.email) : null,
    });
  }

  return { signIn, linkExistingAndSignIn, createAndSignIn, signInWithIdentity };
}

/** Public, BFF-driven OAuth routes (under the credential limiter). Tokens only ever reach the BFF. */
export const oauthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { provider: OAuthProviderId }; Body: { intent?: Intent; redirectUrl?: string } }>(
    "/oauth/:provider/start",
    {
      config: { public: true },
      schema: {
        params: PROVIDER_PARAMS,
        body: {
          type: "object",
          properties: {
            intent: { type: "string", enum: ["signin", "link"] },
            redirectUrl: { type: "string", maxLength: 512 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const provider = getOAuthProvider(request.params.provider);
      const redirectUri = oauthRedirectUri(request.params.provider);
      if (!provider?.enabled() || !redirectUri) return reply.status(404).send(DISABLED);
      const intent: Intent = request.body?.intent ?? "signin";

      let accountId: string | null = null;
      if (intent === "link") {
        // Linking needs the signed-in account (Bearer from the BFF); impersonation is refused there.
        await requireAccountSession(request, reply);
        if (reply.sent) return reply;
        accountId = request.account!.accountId;
        const row = await userRow(fastify, accountId);
        if (row === "error") return reply.status(503).send(UNAVAILABLE);
        if (row?.role === "superAdmin") return reply.status(403).send(NOT_ALLOWED);
      }

      const state = newOpaqueId();
      const codeVerifier = newOpaqueId();
      const nonce = newOpaqueId();
      await saveOAuthState(state, {
        provider: provider.id,
        intent,
        accountId,
        codeVerifier,
        nonce,
        redirectUrl: safeRelativePath(request.body?.redirectUrl ?? "/dashboard"),
      });
      const url = provider.authorizeUrl({ state, codeChallenge: pkceChallenge(codeVerifier), nonce, redirectUri });
      return reply.send({ url, state });
    },
  );

  fastify.post<{ Params: { provider: OAuthProviderId }; Body: { code: string; state: string; client: "web" } }>(
    "/oauth/:provider/callback",
    {
      config: { public: true },
      schema: {
        params: PROVIDER_PARAMS,
        body: {
          type: "object",
          required: ["code", "state", "client"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 2048 },
            state: { type: "string", minLength: 1, maxLength: 128 },
            client: { type: "string", enum: ["web"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const provider = getOAuthProvider(request.params.provider);
      const redirectUri = oauthRedirectUri(request.params.provider);
      if (!provider?.enabled() || !redirectUri) return reply.status(404).send(DISABLED);

      const st = await consumeOAuthState(request.body.state);
      if (!st || st.provider !== provider.id) return reply.status(400).send({ ...STATE_INVALID, intent: "signin" });

      let identity: OAuthIdentity;
      try {
        identity = await provider.exchange({
          code: request.body.code,
          codeVerifier: st.codeVerifier,
          nonce: st.nonce,
          redirectUri,
        });
      } catch (e) {
        request.log.warn({ provider: provider.id, err: e instanceof OAuthError ? e.message : "unknown" }, "oauth exchange failed");
        return reply.status(400).send({ ...FAILED(provider.label), intent: st.intent });
      }

      const db = fastify.prisma;
      const link = await db.authOAuthLink.findUnique({
        where: { provider_providerSub: { provider: provider.id, providerSub: identity.sub } },
      });

      if (st.intent === "link") {
        const accountId = st.accountId!;
        if (link) {
          if (link.accountId !== accountId) return reply.status(409).send({ ...ALREADY_LINKED(provider.label), intent: "link" });
          return reply.send({ result: "linked", provider: provider.id });
        }
        try {
          await db.authOAuthLink.create({
            data: {
              accountId,
              provider: provider.id,
              providerSub: identity.sub,
              emailAtLink: identity.email ? normalizeEmail(identity.email) : null,
            },
          });
        } catch (e) {
          if (!isP2002(e)) throw e;
          return reply.status(409).send({ ...PROVIDER_TAKEN(provider.label), intent: "link" });
        }
        return reply.send({ result: "linked", provider: provider.id });
      }

      const f = flows(fastify, request, reply);
      if (link) {
        await bestEffort(() => db.authOAuthLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } }));
        return f.signIn(link.accountId, provider, st.redirectUrl);
      }
      return f.signInWithIdentity(provider, identity, st.redirectUrl);
    },
  );

  fastify.post<{ Body: { pendingId: string; email?: string } }>(
    "/oauth/pending/send",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["pendingId"],
          properties: {
            pendingId: { type: "string", minLength: 1, maxLength: 128 },
            email: { type: "string", minLength: 3, maxLength: 254 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { pendingId } = request.body;
      const pending = await loadPendingOAuth(pendingId);
      if (!pending) return reply.status(400).send(EXPIRED);
      // The provider's email when it gave one; otherwise the address the person typed.
      const target = pending.email ?? (request.body.email ? normalizeEmail(request.body.email) : null);
      if (!validEmail(target)) return reply.status(400).send(INVALID_EMAIL);
      const label = getOAuthProvider(pending.provider)?.label ?? "your account";

      // Same answer whether or not an account uses the address; the work happens after the reply.
      await reply.status(202).send({ ok: true });
      const work = (async () => {
        try {
          const issued = await issueCode(fastify.prisma, { purpose: "email_verify", target });
          if ("error" in issued) return;
          await savePendingOAuth(pendingId, { ...pending, target, codeId: issued.codeId });
          await sendCodeEmail(
            target,
            "email_verify",
            issued.code,
            `Use this code to confirm your email and finish signing in to WBMSG with ${label}.`,
          );
        } catch (e) {
          fastify.log.warn({ err: e instanceof Error ? e.name : "unknown" }, "oauth pending code failed");
        }
      })();
      pendingWork.add(work);
      void work.finally(() => pendingWork.delete(work));
    },
  );

  fastify.post<{ Body: { pendingId: string; code: string; client: "web" } }>(
    "/oauth/pending/verify",
    {
      config: { public: true },
      schema: {
        body: {
          type: "object",
          required: ["pendingId", "code", "client"],
          properties: {
            pendingId: { type: "string", minLength: 1, maxLength: 128 },
            code: { type: "string", minLength: 1, maxLength: 16 },
            client: { type: "string", enum: ["web"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const { pendingId, code } = request.body;
      const fail = async (body: ReturnType<typeof err>) => {
        await padTo(startedAt);
        return reply.status(400).send(body);
      };
      const pending = await loadPendingOAuth(pendingId);
      if (!pending) return fail(EXPIRED);
      if (!pending.codeId || !pending.target) return fail(INVALID_CODE);
      const result = await verifyCodeById(fastify.prisma, { codeId: pending.codeId, purpose: "email_verify", code });
      if (!result.ok || result.target !== pending.target) return fail(INVALID_CODE);
      await deletePendingOAuth(pendingId);

      const provider = getOAuthProvider(pending.provider);
      if (!provider?.enabled()) return reply.status(404).send(DISABLED);
      const db = fastify.prisma;
      const f = flows(fastify, request, reply);
      const email = pending.target;

      // Linked meanwhile (e.g. in another tab): just sign in.
      const link = await db.authOAuthLink.findUnique({
        where: { provider_providerSub: { provider: provider.id, providerSub: pending.sub } },
      });
      if (link) return f.signIn(link.accountId, provider, pending.redirectUrl);

      const existing = await db.authAccount.findUnique({ where: { email } });
      if (existing) return f.linkExistingAndSignIn(existing, provider, { sub: pending.sub, email }, pending.redirectUrl);
      return f.createAndSignIn(
        provider,
        { sub: pending.sub, email, firstName: pending.firstName, lastName: pending.lastName },
        pending.redirectUrl,
      );
    },
  );
};

/** Authenticated: remove a linked provider (scoped to the caller's account). */
export const oauthAccountRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.delete<{ Params: { provider: OAuthProviderId } }>(
    "/oauth/:provider",
    { config: { public: true }, preHandler: requireAccountSession, schema: { params: PROVIDER_PARAMS } },
    async (request, reply) => {
      const { accountId } = request.account!;
      const { provider } = request.params;
      const account = await fastify.prisma.authAccount.findUnique({
        where: { id: accountId },
        select: { passwordHash: true, mustSetPassword: true, phoneVerifiedAt: true, oauthLinks: { select: { provider: true } } },
      });
      if (!account || !account.oauthLinks.some((l) => l.provider === provider)) {
        return reply.status(404).send(NOT_LINKED);
      }
      // Email codes are a recovery path, not counted: something else must still sign this person in.
      const others =
        account.oauthLinks.filter((l) => l.provider !== provider).length +
        (account.passwordHash && !account.mustSetPassword ? 1 : 0) +
        (account.phoneVerifiedAt && whatsappAuthConfig() ? 1 : 0);
      if (others === 0) return reply.status(409).send(LAST_METHOD);
      await fastify.prisma.authOAuthLink.deleteMany({ where: { accountId, provider } });
      return reply.send({ ok: true });
    },
  );
};

/** Public: which optional sign-in methods are switched on (the web shows only these buttons). */
export const methodsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/methods", { config: { public: true } }, async (_request, reply) => {
    return reply.header("cache-control", "no-store").send({
      whatsapp: whatsappAuthConfig() !== null,
      google: getOAuthProvider("google")!.enabled(),
      facebook: getOAuthProvider("facebook")!.enabled(),
    });
  });
};
