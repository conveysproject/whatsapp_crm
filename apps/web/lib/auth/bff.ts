import { NextResponse } from "next/server";
import {
  ACCESS_MAX_AGE,
  COOKIE,
  DEVICE_MAX_AGE,
  REFRESH_MAX_AGE,
  apiBaseUrl,
} from "./config";

const UNAVAILABLE_BODY = { error: { code: "UNAVAILABLE", message: "Please try again." } };

export function requireSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>([new URL(req.url).origin]);
  const app = process.env["NEXT_PUBLIC_APP_URL"];
  if (app) {
    try {
      allowed.add(new URL(app).origin);
    } catch {
      /* ignore malformed env */
    }
  }
  return allowed.has(origin);
}

// Relies on Vercel overwriting x-forwarded-for/x-real-ip with the connecting client; not safe behind proxies that append.
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || null;
}

export async function callAuthApi(
  path: string,
  init: { method: string; body?: unknown; req: Request; bearer?: string },
): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const secret = process.env["AUTH_BFF_SECRET"];
  if (secret) headers["x-wbmsg-bff"] = secret;
  const ip = clientIp(init.req);
  if (ip) headers["x-wbmsg-client-ip"] = ip;
  const ua = init.req.headers.get("user-agent");
  if (ua) headers["user-agent"] = ua;
  if (init.bearer) headers["authorization"] = `Bearer ${init.bearer}`;
  return fetch(`${apiBaseUrl()}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
}

const secure = () => process.env["NODE_ENV"] !== "development";
const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: secure(),
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export function setSessionCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string; deviceId?: string },
): void {
  res.cookies.set(COOKIE.refresh, tokens.refreshToken, cookieOpts(REFRESH_MAX_AGE));
  res.cookies.set(COOKIE.access, tokens.accessToken, cookieOpts(ACCESS_MAX_AGE));
  if (tokens.deviceId) res.cookies.set(COOKIE.device, tokens.deviceId, cookieOpts(DEVICE_MAX_AGE));
}

export function clearSessionCookies(res: NextResponse): void {
  for (const name of [COOKIE.refresh, COOKIE.device, COOKIE.access]) {
    res.cookies.set(name, "", cookieOpts(0));
  }
}

export function unavailable(): NextResponse {
  return NextResponse.json(UNAVAILABLE_BODY, { status: 503, headers: { "Cache-Control": "no-store" } });
}

export type RefreshResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; status: 401 | 503 };

const inflight = new Map<string, Promise<RefreshResult>>();

/** Rotates a refresh token; concurrent calls for the same token share one upstream request. */
export function refreshSession(refreshToken: string, req: Request): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;
  const p = (async (): Promise<RefreshResult> => {
    try {
      const res = await callAuthApi("/v1/auth/refresh", { method: "POST", body: { refreshToken }, req });
      if (res.status === 401) return { ok: false, status: 401 };
      if (!res.ok) return { ok: false, status: 503 };
      const data = (await res.json()) as { accessToken?: unknown; refreshToken?: unknown };
      if (typeof data.accessToken !== "string" || typeof data.refreshToken !== "string") {
        return { ok: false, status: 503 };
      }
      return { ok: true, accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch {
      return { ok: false, status: 503 };
    }
  })().finally(() => {
    inflight.delete(refreshToken);
  });
  inflight.set(refreshToken, p);
  return p;
}
