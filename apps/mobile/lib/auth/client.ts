import { appHeaders, noteResponseStatus } from "../app-headers";
import { config } from "../config";
import type { AuthResponse } from "./flows";
import type { RefreshResult } from "./session-store";

/** Direct calls to the WBMSG auth API (no web BFF on mobile). Every sign-in says `client: "mobile"`. */
export function createAuthClient(baseUrl: string = config.apiUrl) {
  async function call(method: "GET" | "POST", path: string, body?: Record<string, unknown>, bearer?: string): Promise<AuthResponse> {
    const headers: Record<string, string> = { Accept: "application/json", ...appHeaders() };
    if (body) headers["Content-Type"] = "application/json";
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch {
      return { status: 0, body: null };
    }
    noteResponseStatus(res.status);
    const json: unknown = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  return {
    signInPassword: (email: string, password: string, deviceId: string | null) =>
      call("POST", "/auth/signin/password", { email: email.trim(), password, client: "mobile", ...(deviceId ? { deviceId } : {}) }),
    verifyNewDevice: (challengeId: string, code: string) =>
      call("POST", "/auth/signin/new-device", { challengeId, code: code.trim(), client: "mobile" }),
    requestEmailCode: (email: string) => call("POST", "/auth/signin/code/request", { email: email.trim() }),
    verifyEmailCode: (email: string, code: string) =>
      call("POST", "/auth/signin/code/verify", { email: email.trim(), code: code.trim(), client: "mobile" }),
    resetPassword: (email: string, code: string, newPassword: string) =>
      call("POST", "/auth/password/reset", { email: email.trim(), code: code.trim(), newPassword, client: "mobile" }),
    me: (accessToken: string) => call("GET", "/users/me", undefined, accessToken),
    async signOut(accessToken: string): Promise<void> {
      await call("POST", "/auth/signout", undefined, accessToken);
    },
    /** 200 → rotated tokens; 401 → session over; anything else is transient and throws (the user stays signed in). */
    async refresh(refreshToken: string): Promise<RefreshResult> {
      const r = await call("POST", "/auth/refresh", { refreshToken });
      const b = r.body as { accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown } | null;
      if (r.status === 200 && typeof b?.accessToken === "string" && typeof b.refreshToken === "string") {
        return { ok: true, accessToken: b.accessToken, refreshToken: b.refreshToken, ...(typeof b.expiresIn === "number" ? { expiresIn: b.expiresIn } : {}) };
      }
      if (r.status === 401) return { ok: false };
      throw new Error(r.status === 0 ? "Network request failed" : `Refresh failed (${r.status})`);
    },
    /** Status of the public key endpoint: 200 when the API runs WBMSG login, 404 when it runs Clerk, 0 offline. */
    async probe(): Promise<number> {
      return (await call("GET", "/auth/.well-known/jwks.json")).status;
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
