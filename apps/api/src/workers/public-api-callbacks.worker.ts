import { Worker, UnrecoverableError, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { decryptToken } from "../lib/public-api/credentials.js";
import { newNonce, signV2 } from "../lib/public-api/plivo-signature.js";
import { assertSafeCallbackUrl, UnsafeUrlError } from "../lib/public-api/safe-url.js";
import { safeErr } from "../lib/public-api/safe-err.js";
import type { CallbackJob } from "../lib/public-api/queues.js";

const TIMEOUT_MS = 10_000;

export function callbackBackoff(attemptsMade: number): number {
  return 60_000 * 2 ** (attemptsMade - 1); // 60 s, 120 s, 240 s
}

export async function deliverCallback(job: Pick<Job<CallbackJob>, "data">, fetchImpl: typeof fetch = fetch): Promise<void> {
  const { apiKeyId, organizationId, url, method, fields } = job.data;

  const key = await prisma.apiKey.findUnique({ where: { id: apiKeyId }, select: { tokenEnc: true, revokedAt: true, organizationId: true } });
  if (!key || key.organizationId !== organizationId || key.revokedAt || !key.tokenEnc) {
    throw new UnrecoverableError("credential unavailable");
  }
  try { await assertSafeCallbackUrl(url); }
  catch (err) {
    if (err instanceof UnsafeUrlError) throw new UnrecoverableError(`unsafe callback URL: ${err.message}`);
    throw err;
  }

  // A token that cannot be decrypted (missing/rotated key, corrupt row) will not decrypt on a retry either.
  let authToken: string;
  try { authToken = decryptToken(key.tokenEnc); }
  catch { throw new UnrecoverableError("credential token cannot be decrypted"); }

  const nonce = newNonce();
  const signature = signV2(url, nonce, authToken);
  const form = new URLSearchParams(fields).toString();
  const headers: Record<string, string> = {
    "X-Plivo-Signature-V2": signature,
    "X-Plivo-Signature-Ma-V2": signature,
    "X-Plivo-Signature-V2-Nonce": nonce,
  };
  const isGet = method === "GET";
  const res = await fetchImpl(isGet ? `${url}${url.includes("?") ? "&" : "?"}${form}` : url, {
    method,
    headers: isGet ? headers : { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    ...(isGet ? {} : { body: form }),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Drain the body we never read, so the undici socket is released (concurrency 10 would otherwise pin sockets).
  await res.body?.cancel().catch(() => {});
  if (!res.ok) throw new Error(`callback endpoint answered HTTP ${res.status}`);
}

/** Worker `failed` handler: job id, attempt and a safe projection of the error only (never its message). */
export function onCallbackJobFailed(job: Pick<Job<CallbackJob>, "id" | "attemptsMade"> | undefined, err: Error): void {
  console.warn("[public-api-callbacks] job attempt failed", { jobId: job?.id, attempt: job?.attemptsMade, ...safeErr(err) });
}

export function startPublicApiCallbackWorker() {
  const worker = new Worker<CallbackJob>("public-api-callbacks", (job) => deliverCallback(job), {
    connection: redisConnection,
    concurrency: 10,
    settings: { backoffStrategy: callbackBackoff },
  });
  worker.on("error", (err) => console.error("[public-api-callbacks] worker error", safeErr(err)));
  worker.on("failed", onCallbackJobFailed);
  return worker;
}
