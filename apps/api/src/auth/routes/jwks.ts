import type { FastifyPluginAsync } from "fastify";
import { getJwks } from "../tokens.js";

/** Public key set for verifying WBMSG access tokens. Public keys only; not behind the credential limiter. */
export const jwksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/.well-known/jwks.json", { config: { public: true } }, async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(await getJwks());
  });
};
