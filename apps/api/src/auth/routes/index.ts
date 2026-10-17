import type { FastifyPluginAsync } from "fastify";
import { authClientIp, hitLimit } from "../limits.js";
import { signupRoutes } from "./signup.js";
import { signinRoutes } from "./signin.js";
import { sessionRoutes } from "./session.js";

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
  // Later tasks add password/forgot and password/reset here.
};

export const authRouter: FastifyPluginAsync = async (fastify) => {
  await fastify.register(credentialRoutes);
  // Refresh has its own limit; authenticated routes use only the app-wide limiter.
  await fastify.register(sessionRoutes);
};
