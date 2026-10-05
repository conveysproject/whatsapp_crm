import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { isFeatureEnabled } from "../lib/plan-limits.js";
import { writeAdminAudit } from "../lib/audit.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../lib/public-api/safe-url.js";
import { encryptToken, hashToken, newAuthToken, TokenKeyError } from "../lib/public-api/credentials.js";

interface CredentialBody { name?: string; callbackUrl?: string | null; inboundUrl?: string | null }

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
    if (!canAccessSub(role, permissions, "settings_access", "api_credentials")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "api_credentials permission required" } });
    }
    if (!(await isFeatureEnabled(fastify.prisma, request.auth.organizationId, "api_access"))) {
      return reply.status(403).send({ error: { code: "PLAN_REQUIRED", message: "API access is not enabled for this plan" } });
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
    const { name, callbackUrl, inboundUrl } = request.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: { code: "MISSING_NAME", message: "name is required" } });
    if (!(await validUrl(reply, callbackUrl, "callbackUrl"))) return reply;
    if (!(await validUrl(reply, inboundUrl, "inboundUrl"))) return reply;

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
