import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { sentryPlugin } from "./plugins/sentry.js";
import prismaPlugin from "./plugins/prisma.js";
import swaggerPlugin from "./plugins/swagger.js";
import authPlugin from "./plugins/auth.js";
import { routes } from "./routes/index.js";
import { setupSearchIndexes } from "./lib/search.js";
import multipart from "@fastify/multipart";
import socketioPlugin from "./plugins/socketio.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import "./workers/inbound-message.worker.js";
import "./workers/campaign.worker.js";
import "./workers/flow.worker.js";

const PORT = Number(process.env["API_PORT"] ?? 4000);
const HOST = process.env["API_HOST"] ?? "0.0.0.0";

const server = Fastify({
  logger: {
    level: process.env["NODE_ENV"] === "production" ? "info" : "debug",
    transport:
      process.env["NODE_ENV"] !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

async function start() {
  await server.register(sentryPlugin);
  await server.register(helmet);
  await server.register(cors, {
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
  });
  await server.register(prismaPlugin);
  await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await server.register(swaggerPlugin);
  await server.register(authPlugin);
  await server.register(rateLimitPlugin);
  await server.register(socketioPlugin);
  await server.register(routes);

  await server.listen({ port: PORT, host: HOST });
  server.log.info(`API running on http://${HOST}:${PORT}`);
  setupSearchIndexes().catch((err) => server.log.warn({ err }, "Meilisearch setup failed"));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
