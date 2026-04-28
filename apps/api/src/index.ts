import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { sentryPlugin } from "./plugins/sentry.js";
import { healthRoute } from "./routes/health.js";

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

  await server.register(healthRoute);

  await server.listen({ port: PORT, host: HOST });
  server.log.info(`API running on http://${HOST}:${PORT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
