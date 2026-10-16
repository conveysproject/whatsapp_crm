import type { FastifyPluginAsync } from "fastify";
import { authClientIp, hitLimit } from "../limits.js";
import { signupRoutes } from "./signup.js";

export const authRouter: FastifyPluginAsync = async (fastify) => {
  // Per-IP limit for every auth route. onRequest so it also covers malformed bodies.
  fastify.addHook("onRequest", async (request, reply) => {
    if (await hitLimit(`auth:ip:${authClientIp(request)}`, 20, 600)) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
      });
    }
  });

  await fastify.register(signupRoutes);
};
