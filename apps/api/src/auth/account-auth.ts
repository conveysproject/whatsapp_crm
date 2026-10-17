import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyBearer } from "./identity.js";

const UNAUTHORIZED = { error: { code: "UNAUTHORIZED", message: "Invalid or missing token" } };
const NO_SESSION = { error: { code: "NO_SESSION", message: "This action needs a WBMSG session." } };
const IMPERSONATION_BLOCKED = {
  error: { code: "IMPERSONATION_BLOCKED", message: "Not available while viewing as another user." },
};

/**
 * Authenticates account-level routes (sessions, password change, security overview).
 * They need a valid account session but not an organization membership, so the routes are
 * public to the global auth plugin and use this preHandler instead.
 */
export async function requireAccountSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.headers["x-impersonate-token"] !== undefined) {
    return reply.status(403).send(IMPERSONATION_BLOCKED);
  }
  let identity: Awaited<ReturnType<typeof verifyBearer>>;
  try {
    identity = await verifyBearer(request.headers.authorization);
  } catch {
    return reply.status(401).send(UNAUTHORIZED);
  }
  if (!identity.sid) return reply.status(400).send(NO_SESSION);
  request.account = { accountId: identity.userId, sid: identity.sid, typ: identity.typ };
}
