import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const redisConnection = new Redis(
  process.env["REDIS_URL"] ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null, enableReadyCheck: false }
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
  // attempts:1 — flow steps are not idempotent (they send messages); retrying a
  // failed job would re-send every message the flow already delivered.
  defaultJobOptions: { attempts: 1 },
});

export const contactImportQueue = new Queue("contact-import", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});

export const conversationSummaryQueue = new Queue("conversation-summary", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
});

export const noReplyQueue = new Queue("no-reply-checks", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
});

export const resumeFlowQueue = new Queue("resume-flow", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});
