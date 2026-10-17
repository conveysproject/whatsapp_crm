import type { FastifyInstance, FastifyRequest } from "fastify";
import { trustDevice } from "./devices.js";
import { authClientIp } from "./limits.js";
import { createSession } from "./sessions.js";

export interface IssuedUserSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  deviceId: string;
}

/**
 * Customer (typ=user) session after a possession-proving sign-in (WhatsApp code, Google, Facebook).
 * The device becomes trusted, like the email-code sign-in. Never used for super admins.
 */
export async function startUserSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
  accountId: string,
  client: "web" | "mobile",
): Promise<IssuedUserSession> {
  const session = await createSession(fastify.prisma, {
    accountId,
    client,
    typ: "user",
    ip: authClientIp(request),
    userAgent: request.headers["user-agent"],
  });
  const deviceId = await trustDevice(fastify.prisma, accountId);
  return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresIn: 600, deviceId };
}
