import { Queue } from "bullmq";
import { redisConnection } from "../queue.js";
import type { WaInteractivePayload, WaTemplateComponent } from "../whatsapp.js";

export type SendContentForWorker =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaUrl: string; caption: string | null }
  | { kind: "template"; name: string; language: string; components: WaTemplateComponent[] }
  | { kind: "location"; latitude: string; longitude: string; name: string; address: string }
  | { kind: "interactive"; interactive: WaInteractivePayload };

export interface SendJob { messageId: string; organizationId: string; to: string; content: SendContentForWorker }

export interface CallbackJob {
  apiKeyId: string;
  organizationId: string;
  url: string;
  method: "GET" | "POST";
  fields: Record<string, string>;
}

// attempts:1 for sends: a retry could deliver the same WhatsApp message twice.
export const publicApiSendQueue = new Queue<SendJob>("public-api-send", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: 604800 } },
});

// 1 try + 3 retries; the worker's custom backoff yields 60 s, 120 s, 240 s.
export const publicApiCallbackQueue = new Queue<CallbackJob>("public-api-callbacks", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 4, backoff: { type: "custom" }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } },
});
