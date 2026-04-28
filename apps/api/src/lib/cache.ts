import { redisConnection } from "./queue.js";

const DEFAULT_TTL = 60;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redisConnection.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  await redisConnection.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await redisConnection.del(key);
}

export function orgKey(organizationId: string, resource: string): string {
  return `org:${organizationId}:${resource}`;
}
