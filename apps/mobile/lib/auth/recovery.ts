/**
 * Lets API callers recover from a 401 on a token that has not expired yet (the server revoked the session, or the
 * access token was rotated elsewhere). Registered by the WBMSG login; with nothing registered a 401
 * is reported as is. Kept free of other imports so lib/api.ts can use it.
 */
type Recover = (staleToken: string) => Promise<string | null>;

let recover: Recover | null = null;

export function setSessionRecovery(fn: Recover | null): void {
  recover = fn;
}

/** A fresh token to retry with once, or null (no recovery available, or the session is over and was signed out). */
export async function recoverFrom401(staleToken: string | null): Promise<string | null> {
  if (!recover || !staleToken) return null;
  try {
    return await recover(staleToken);
  } catch {
    return null;
  }
}
