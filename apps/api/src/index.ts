import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { sentryPlugin } from "./plugins/sentry.js";
import prismaPlugin from "./plugins/prisma.js";
import swaggerPlugin from "./plugins/swagger.js";
import authPlugin from "./plugins/auth.js";
import { routes } from "./routes/index.js";

import multipart from "@fastify/multipart";
import socketioPlugin from "./plugins/socketio.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import "./workers/inbound-message.worker.js";
import "./workers/campaign.worker.js";
import "./workers/flow.worker.js";
import "./workers/contact-import.worker.js";
import "./workers/conversation-summary.worker.js";
import "./workers/no-reply.worker.js";
import "./workers/resume-flow.worker.js";
import { startMessageCleanupWorker, scheduleMessageCleanupCron } from "./workers/message-cleanup.js";
import { startTrustScoreWorker, scheduleTrustScoreCron } from "./workers/trust-score.js";
import { startClosureDeadlineWorker, scheduleClosureDeadlineCron } from "./workers/closure-deadline.worker.js";
console.log("[startup] all workers ready");

if (process.env["NODE_ENV"] === "production" && process.env["IS_DEMO_MODE"] === "true") {
  console.error("[startup] FATAL: IS_DEMO_MODE=true must never be set in production");
  process.exit(1);
}

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
  const corsOrigins = (process.env["CORS_ORIGIN"] ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  await server.register(cors, {
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  });
  await server.register(prismaPlugin);
  await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await server.register(swaggerPlugin);
  await server.register(authPlugin);
  await server.register(rateLimitPlugin);
  await server.register(socketioPlugin);
  await server.register(routes);

  await server.listen({ port: PORT, host: HOST });
  server.log.info(`API running on http://${HOST}:${PORT}`);
  startMessageCleanupWorker();
  scheduleMessageCleanupCron().catch((err) => server.log.warn({ err }, "Message cleanup cron schedule failed"));
  startTrustScoreWorker();
  scheduleTrustScoreCron().catch((err) => server.log.warn({ err }, "Trust score cron schedule failed"));
  startClosureDeadlineWorker();
  scheduleClosureDeadlineCron().catch((err) => server.log.warn({ err }, "Closure deadline cron schedule failed"));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
