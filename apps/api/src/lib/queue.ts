import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const redisConnection = new Redis(
  process.env["REDIS_URL"] ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

export const inboundMessageQueue = new Queue("inbound-messages", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
});

export const campaignQueue = new Queue("campaigns", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
});

export const flowQueue = new Queue("flows", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});
