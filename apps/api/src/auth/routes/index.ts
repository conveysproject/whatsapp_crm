import type { FastifyPluginAsync } from "fastify";
import { authClientIp, hitLimit } from "../limits.js";
import { signupRoutes } from "./signup.js";
import { signinRoutes } from "./signin.js";
import { sessionRoutes } from "./session.js";
import { jwksRoutes } from "./jwks.js";
import { securityRoutes } from "./security.js";
import { invitationAcceptRoutes } from "./invitations.js";
import { clientInvitationAcceptRoutes } from "./client-invitations.js";
import { passwordChangeRoutes, passwordRoutes } from "./password.js";
import { phoneRoutes, whatsappSigninRoutes } from "./whatsapp.js";
import { methodsRoutes, oauthAccountRoutes, oauthRoutes } from "./oauth.js";

/** Credential/code endpoints: 20 requests / 10 min per IP. onRequest so it also covers malformed bodies. */
const credentialRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (await hitLimit(`auth:ip:${authClientIp(request)}`, 20, 600)) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
      });
    }
  });

  await fastify.register(signupRoutes);
  await fastify.register(signinRoutes);
  await fastify.register(passwordRoutes);
  await fastify.register(invitationAcceptRoutes);
  await fastify.register(clientInvitationAcceptRoutes);
  await fastify.register(whatsappSigninRoutes);
  await fastify.register(oauthRoutes);
};

export const authRouter: FastifyPluginAsync = async (fastify) => {
  await fastify.register(credentialRoutes);
  // Refresh has its own limit; authenticated routes use only the app-wide limiter.
  await fastify.register(sessionRoutes);
  await fastify.register(passwordChangeRoutes);
  await fastify.register(securityRoutes);
  await fastify.register(phoneRoutes);
  await fastify.register(oauthAccountRoutes);
  // Public key set: no credentials involved, so no credential limiter.
  await fastify.register(jwksRoutes);
  await fastify.register(methodsRoutes);
};
