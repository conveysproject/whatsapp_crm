import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { writeAdminAudit } from "../lib/audit.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../lib/public-api/safe-url.js";
import { checkPublicApiAccess, MAX_ACTIVE_CREDENTIALS } from "../lib/public-api/access.js";
import { encryptToken, hashToken, newAuthToken, TokenKeyError } from "../lib/public-api/credentials.js";

interface CredentialBody { name?: string; callbackUrl?: string | null; inboundUrl?: string | null }

const MAX_NAME = 100;
const MAX_URL = 2048;

/**
 * Shape check before anything touches the values: a non-string name would crash `.trim()` and an array URL would pass
 * `new URL()` (it coerces to a string) and then fail in Prisma, both as 500s. Returns an error message, or null.
 * `name` may be absent here (POST reports a missing name separately); when present it must be 1..100 chars trimmed.
 */
function invalidCredentialBody(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body !== "object" || Array.isArray(body)) return "body must be a JSON object";
  const b = body as Record<string, unknown>;
  const name = b["name"];
  if (name !== undefined) {
    if (typeof name !== "string") return "name must be a string";
    const len = name.trim().length;
    if (len < 1 || len > MAX_NAME) return `name must be 1 to ${MAX_NAME} characters`;
  }
  for (const field of ["callbackUrl", "inboundUrl"] as const) {
    const v = b[field];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return `${field} must be a string or null`;
    if (v.length > MAX_URL) return `${field} must be at most ${MAX_URL} characters`;
  }
  return null;
}

const invalidBody = (reply: FastifyReply, message: string) => reply.status(400).send({ error: { code: "INVALID_BODY", message } });

const LIST_SELECT = {
  id: true, name: true, callbackUrl: true, inboundUrl: true, lastUsedAt: true, revokedAt: true, createdAt: true,
} as const;

async function validUrl(reply: FastifyReply, url: string | null | undefined, field: string): Promise<boolean> {
  if (url == null || url === "") return true;
  try { await assertSafeCallbackUrl(url); return true; }
  catch (err) {
    if (!(err instanceof UnsafeUrlError)) throw err;
    await reply.status(400).send({ error: { code: "INVALID_URL", message: `${field}: ${err.message}` } });
    return false;
  }
}

export const apiCredentialsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_api_key")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_api_key permission required" } });
    }
    // Same body for "not allow-listed" and "blocked" so the reason is not revealed.
    const access = await checkPublicApiAccess(fastify.prisma, request.auth.organizationId);
    if (!access.allowed) {
      return reply.status(403).send({ error: { code: "API_NOT_AVAILABLE", message: "API access is not available for this organization." } });
    }
  });

  fastify.get("/api-credentials", async (request, reply) => {
    const data = await fastify.prisma.apiKey.findMany({
      where: { organizationId: request.auth.organizationId },
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: CredentialBody }>("/api-credentials", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const bodyError = invalidCredentialBody(request.body);
    if (bodyError) return invalidBody(reply, bodyError);
    const { name, callbackUrl, inboundUrl } = request.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: { code: "MISSING_NAME", message: "name is required" } });
    if (!(await validUrl(reply, callbackUrl, "callbackUrl"))) return reply;
    if (!(await validUrl(reply, inboundUrl, "inboundUrl"))) return reply;

    // Cap before generating or storing anything. A tiny race between this count and the create is accepted.
    const active = await fastify.prisma.apiKey.count({ where: { organizationId, revokedAt: null } });
    if (active >= MAX_ACTIVE_CREDENTIALS) {
      return reply.status(409).send({ error: { code: "CREDENTIAL_LIMIT", message: `You can have at most ${MAX_ACTIVE_CREDENTIALS} active credentials. Revoke one first.` } });
    }

    const token = newAuthToken();
    let tokenEnc: string;
    try { tokenEnc = encryptToken(token); }
    catch (err) {
      if (err instanceof TokenKeyError) return reply.status(503).send({ error: { code: "NOT_CONFIGURED", message: "Public API encryption key is not configured" } });
      throw err;
    }
    const row = await fastify.prisma.apiKey.create({
      data: {
        organizationId, name: name.trim(), keyHash: hashToken(token), tokenEnc, scopes: ["whatsapp"],
        createdBy: userId, callbackUrl: callbackUrl || null, inboundUrl: inboundUrl || null,
      },
      select: { id: true, name: true, createdAt: true },
    });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.create", targetType: "api_credential", targetId: row.id, metadata: { organizationId }, request });
    return reply.status(201).send({ data: { authId: row.id, authToken: token, name: row.name, createdAt: row.createdAt } });
  });

  fastify.patch<{ Params: { id: string }; Body: CredentialBody }>("/api-credentials/:id", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const existing = await fastify.prisma.apiKey.findFirst({ where: { id: request.params.id, organizationId, revokedAt: null } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });
    const bodyError = invalidCredentialBody(request.body);
    if (bodyError) return invalidBody(reply, bodyError);
    const { name, callbackUrl, inboundUrl } = request.body ?? {};
    if (!(await validUrl(reply, callbackUrl, "callbackUrl"))) return reply;
    if (!(await validUrl(reply, inboundUrl, "inboundUrl"))) return reply;
    const data = await fastify.prisma.apiKey.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(callbackUrl !== undefined && { callbackUrl: callbackUrl || null }),
        ...(inboundUrl !== undefined && { inboundUrl: inboundUrl || null }),
      },
      select: LIST_SELECT,
    });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.update", targetType: "api_credential", targetId: existing.id, metadata: { organizationId }, request });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/api-credentials/:id/rotate", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const existing = await fastify.prisma.apiKey.findFirst({ where: { id: request.params.id, organizationId, revokedAt: null } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });
    const token = newAuthToken();
    let tokenEnc: string;
    try { tokenEnc = encryptToken(token); }
    catch (err) {
      if (err instanceof TokenKeyError) return reply.status(503).send({ error: { code: "NOT_CONFIGURED", message: "Public API encryption key is not configured" } });
      throw err;
    }
    await fastify.prisma.apiKey.update({ where: { id: existing.id }, data: { keyHash: hashToken(token), tokenEnc } });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.rotate", targetType: "api_credential", targetId: existing.id, metadata: { organizationId }, request });
    return reply.send({ data: { authId: existing.id, authToken: token } });
  });

  fastify.delete<{ Params: { id: string } }>("/api-credentials/:id", async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const existing = await fastify.prisma.apiKey.findFirst({ where: { id: request.params.id, organizationId, revokedAt: null } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });
    await fastify.prisma.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    writeAdminAudit({ prisma: fastify.prisma, actorId: userId, action: "api_credential.revoke", targetType: "api_credential", targetId: existing.id, metadata: { organizationId }, request });
    return reply.status(204).send();
  });
};
