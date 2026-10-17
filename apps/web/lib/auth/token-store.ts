// Pure in-memory access-token cache. Never persists the token anywhere.
export type TokenFetchResult = { accessToken: string | null; expiresAt: number | null; userId?: string };
export type TokenFetch = () => Promise<TokenFetchResult>;
export type TokenStatus = "signed_in" | "signed_out" | "unknown";

const REFRESH_SKEW_MS = 30_000;
const SIGNED_OUT_CACHE_MS = 5_000;

export interface TokenStore {
  getToken(): Promise<string | null>;
  status(): TokenStatus;
  userId(): string | null;
  clear(): void;
}

export function createTokenStore(fetchToken: TokenFetch, now: () => number = Date.now): TokenStore {
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string | null> | null = null;
  let cleared = false;
  let status: TokenStatus = "unknown";
  let uid: string | null = null;
  let signedOutUntil = 0;

  async function load(): Promise<string | null> {
    try {
      const r = await fetchToken();
      if (!r.accessToken || r.expiresAt === null) {
        // A definite 401: the session is gone.
        cached = null;
        uid = null;
        status = "signed_out";
        signedOutUntil = now() + SIGNED_OUT_CACHE_MS;
        return null;
      }
      cached = { token: r.accessToken, expiresAt: r.expiresAt };
      if (r.userId) uid = r.userId;
      status = "signed_in";
      return r.accessToken;
    } catch {
      // Transient outage (503/network): never treated as signed out.
      if (cached && cached.expiresAt > now()) {
        status = "signed_in";
        return cached.token;
      }
      status = "unknown";
      return null;
    }
  }

  return {
    async getToken() {
      if (cleared) return null;
      if (cached && cached.expiresAt - REFRESH_SKEW_MS > now()) return cached.token;
      if (status === "signed_out" && now() < signedOutUntil) return null;
      inflight ??= load().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    status: () => status,
    userId: () => uid,
    clear() {
      cleared = true;
      cached = null;
      uid = null;
      status = "signed_out";
    },
  };
}
