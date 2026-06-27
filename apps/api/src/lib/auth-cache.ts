import { redis } from "./redis.js";

/** Clear a user's cached auth context so role/permission/team changes take effect immediately. */
export function invalidateAuthCache(userId: string): Promise<number> {
  return redis.del(`auth:user:${userId}`);
}
