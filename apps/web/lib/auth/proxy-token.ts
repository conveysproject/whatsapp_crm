import { refreshSession } from "./bff";
import { accessTokenExpiry } from "./jwt";

const SKEW_MS = 60_000;

export type ProxyTokenResult =
  | { token: string | null; rotated?: undefined; clear?: undefined }
  | { token: string; rotated: { accessToken: string; refreshToken: string }; clear?: undefined }
  | { token: null; clear: true; rotated?: undefined };

/** wbmsg mode: pick the bearer for a proxied call, refreshing the session when the access cookie is stale. */
export async function resolveProxyToken(
  req: Request,
  cookies: { at?: string; rt?: string },
): Promise<ProxyTokenResult> {
  const { at, rt } = cookies;
  if (at) {
    const exp = accessTokenExpiry(at);
    if (exp !== null && exp > Date.now() + SKEW_MS) return { token: at };
  }
  if (!rt) return { token: at ?? null };
  const result = await refreshSession(rt, req);
  if (result.ok) {
    return {
      token: result.accessToken,
      rotated: { accessToken: result.accessToken, refreshToken: result.refreshToken },
    };
  }
  if (result.status === 401) return { token: null, clear: true };
  return { token: at ?? null };
}
