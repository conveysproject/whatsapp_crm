// Pure in-memory access-token cache. Never persists the token anywhere.
export type TokenFetch = () => Promise<{ accessToken: string | null; expiresAt: number | null }>;

const REFRESH_SKEW_MS = 30_000;

export function createTokenStore(
  fetchToken: TokenFetch,
  now: () => number = Date.now,
): { getToken(): Promise<string | null>; clear(): void } {
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string | null> | null = null;
  let cleared = false;

  async function load(): Promise<string | null> {
    try {
      const r = await fetchToken();
      if (!r.accessToken || r.expiresAt === null) {
        cached = null;
        return null;
      }
      cached = { token: r.accessToken, expiresAt: r.expiresAt };
      return r.accessToken;
    } catch {
      // Transient outage: keep the user signed in while the old token is valid.
      return cached && cached.expiresAt > now() ? cached.token : null;
    }
  }

  return {
    async getToken() {
      if (cleared) return null;
      if (cached && cached.expiresAt - REFRESH_SKEW_MS > now()) return cached.token;
      inflight ??= load().finally(() => {
        inflight = null;
      });
      return inflight;
    },
    clear() {
      cleared = true;
      cached = null;
    },
  };
}
