import { NextRequest, NextResponse } from "next/server";
import { callAuthApi, refreshSession, setSessionCookies } from "./bff";
import { COOKIE } from "./config";
import { accessTokenExpiry } from "./jwt";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  confirmEmailDestination,
  errorDestination,
  isOAuthProvider,
  isProviderUrl,
  parseStateCookie,
  sessionDestination,
  stateCookieValue,
  type OAuthIntent,
  type OAuthProviderId,
} from "./oauth";
import { safeRedirect } from "./redirect";

const NO_STORE = { "Cache-Control": "no-store" };
const STATE_MAX_AGE = 600;
const PENDING_MAX_AGE = 1800;

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env["NODE_ENV"] !== "development",
  sameSite: "lax" as const,
  path: OAUTH_COOKIE_PATH,
  maxAge,
});

function redirectTo(req: NextRequest, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const j = (await res.json()) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const errorCode = (data: Record<string, unknown>): unknown =>
  (data["error"] as { code?: unknown } | undefined)?.code;

/** A usable access token from the cookies, refreshing when needed. `rotated` must be written back to the response. */
async function currentAccessToken(
  req: NextRequest,
): Promise<{ at: string | null; rotated: { accessToken: string; refreshToken: string } | null }> {
  const at = req.cookies.get(COOKIE.access)?.value;
  const exp = at ? accessTokenExpiry(at) : null;
  if (at && exp !== null && exp > Date.now() + 60_000) return { at, rotated: null };
  const rt = req.cookies.get(COOKIE.refresh)?.value;
  if (!rt) return { at: null, rotated: null };
  const r = await refreshSession(rt, req);
  if (!r.ok) return { at: null, rotated: null };
  return { at: r.accessToken, rotated: { accessToken: r.accessToken, refreshToken: r.refreshToken } };
}

async function readForm(req: NextRequest): Promise<Record<string, string>> {
  try {
    const form = await req.formData();
    const out: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/**
 * POST /api/auth/oauth/:provider/start (a same-origin form post). Asks the API for the provider URL,
 * binds the returned state to this browser with an httpOnly cookie, then 303s to the provider.
 */
export async function handleOAuthStart(req: NextRequest, provider: OAuthProviderId): Promise<NextResponse> {
  const form = await readForm(req);
  const intent: OAuthIntent = form["intent"] === "link" ? "link" : "signin";
  const redirectUrl = safeRedirect(form["redirect_url"] ?? null);

  let bearer: string | undefined;
  let rotated: { accessToken: string; refreshToken: string } | null = null;
  if (intent === "link") {
    const t = await currentAccessToken(req);
    if (!t.at) return redirectTo(req, `/sign-in?redirect_url=${encodeURIComponent("/settings/security")}`);
    bearer = t.at;
    rotated = t.rotated;
  }

  let res: NextResponse;
  try {
    const up = await callAuthApi(`/v1/auth/oauth/${provider}/start`, {
      method: "POST",
      body: { intent, redirectUrl },
      req,
      bearer,
    });
    const data = await readJson(up);
    const state = data["state"];
    if (!up.ok || !isProviderUrl(provider, data["url"]) || typeof state !== "string") {
      res = redirectTo(req, errorDestination(intent, up.ok ? "OAUTH_FAILED" : errorCode(data)));
    } else {
      res = NextResponse.redirect(data["url"] as string, 303);
      res.headers.set("Cache-Control", "no-store");
      res.cookies.set(OAUTH_COOKIE.state, stateCookieValue(intent, state), cookieOpts(STATE_MAX_AGE));
    }
  } catch {
    res = redirectTo(req, errorDestination(intent, "UNAVAILABLE"));
  }
  if (rotated) setSessionCookies(res, rotated);
  return res;
}

/**
 * GET /api/auth/oauth/:provider/callback?code&state. The state must match this browser's cookie
 * (login-CSRF guard) before the code is sent to the API. Tokens land only in httpOnly cookies.
 */
export async function handleOAuthCallback(req: NextRequest, provider: OAuthProviderId): Promise<NextResponse> {
  const q = req.nextUrl.searchParams;
  const bound = parseStateCookie(req.cookies.get(OAUTH_COOKIE.state)?.value);
  const intent: OAuthIntent = bound?.intent ?? "signin";
  const code = q.get("code");
  const state = q.get("state");

  const finish = (res: NextResponse) => {
    res.cookies.set(OAUTH_COOKIE.state, "", cookieOpts(0));
    return res;
  };

  if (q.get("error") || !code || !state) return finish(redirectTo(req, errorDestination(intent, "CANCELLED")));
  if (!bound || bound.state !== state) return finish(redirectTo(req, errorDestination(intent, "OAUTH_STATE_INVALID")));

  let up: Response;
  try {
    up = await callAuthApi(`/v1/auth/oauth/${provider}/callback`, {
      method: "POST",
      body: { code, state, client: "web" },
      req,
    });
  } catch {
    return finish(redirectTo(req, errorDestination(intent, "UNAVAILABLE")));
  }
  const data = await readJson(up);
  const result = data["result"];

  if (up.ok && result === "session" && typeof data["accessToken"] === "string" && typeof data["refreshToken"] === "string") {
    const res = redirectTo(req, sessionDestination(data));
    setSessionCookies(res, {
      accessToken: data["accessToken"],
      refreshToken: data["refreshToken"],
      deviceId: typeof data["deviceId"] === "string" ? data["deviceId"] : undefined,
    });
    return finish(res);
  }
  if (up.ok && result === "linked") return finish(redirectTo(req, `/settings/security?linked=${provider}`));
  if (up.ok && result === "confirm_email" && typeof data["pendingId"] === "string") {
    const res = redirectTo(req, confirmEmailDestination(provider, data["email"]));
    res.cookies.set(OAUTH_COOKIE.pending, data["pendingId"], cookieOpts(PENDING_MAX_AGE));
    return finish(res);
  }
  const failIntent = data["intent"] === "link" || data["intent"] === "signin" ? (data["intent"] as OAuthIntent) : intent;
  return finish(redirectTo(req, errorDestination(failIntent, errorCode(data))));
}

const EXPIRED = { error: { code: "OAUTH_EXPIRED", message: "This sign-in expired. Please start again." } };

/** POST /api/auth/oauth/pending/{send,verify}: the pending id comes only from the httpOnly cookie. */
export async function handleOAuthPending(req: NextRequest, step: "send" | "verify"): Promise<NextResponse> {
  const pendingId = req.cookies.get(OAUTH_COOKIE.pending)?.value;
  if (!pendingId) return NextResponse.json(EXPIRED, { status: 400, headers: NO_STORE });
  let input: Record<string, unknown> = {};
  try {
    const b = (await req.json()) as unknown;
    if (b && typeof b === "object" && !Array.isArray(b)) input = b as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  const body: Record<string, unknown> =
    step === "send"
      ? { pendingId, ...(typeof input["email"] === "string" ? { email: input["email"] } : {}) }
      : { pendingId, code: typeof input["code"] === "string" ? input["code"] : "", client: "web" };

  let up: Response;
  try {
    up = await callAuthApi(`/v1/auth/oauth/pending/${step}`, { method: "POST", body, req });
  } catch {
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Please try again." } }, { status: 503, headers: NO_STORE });
  }
  const data = await readJson(up);
  if (step === "verify" && up.ok && typeof data["accessToken"] === "string" && typeof data["refreshToken"] === "string") {
    const res = NextResponse.json({ redirectTo: sessionDestination(data) }, { headers: NO_STORE });
    setSessionCookies(res, {
      accessToken: data["accessToken"],
      refreshToken: data["refreshToken"],
      deviceId: typeof data["deviceId"] === "string" ? data["deviceId"] : undefined,
    });
    res.cookies.set(OAUTH_COOKIE.pending, "", cookieOpts(0));
    return res;
  }
  const { accessToken: _a, refreshToken: _r, deviceId: _d, pendingId: _p, ...rest } = data;
  const res = NextResponse.json(rest, { status: up.status, headers: NO_STORE });
  if (errorCode(data) === "OAUTH_EXPIRED") res.cookies.set(OAUTH_COOKIE.pending, "", cookieOpts(0));
  return res;
}

/** GET /api/auth/methods: which optional sign-in buttons to show. Fails closed (all off). */
export async function handleMethods(req: NextRequest): Promise<NextResponse> {
  try {
    const up = await callAuthApi("/v1/auth/methods", { method: "GET", req });
    if (up.ok) {
      const d = await readJson(up);
      return NextResponse.json(
        { whatsapp: d["whatsapp"] === true, google: d["google"] === true, facebook: d["facebook"] === true },
        { headers: NO_STORE },
      );
    }
  } catch {
    /* fall through */
  }
  return NextResponse.json({ whatsapp: false, google: false, facebook: false }, { headers: NO_STORE });
}

const OAUTH_KEY = /^oauth\/([a-z]+)\/(start|callback)$/;
export function matchOAuthKey(key: string): { provider: OAuthProviderId; step: "start" | "callback" } | null {
  const m = OAUTH_KEY.exec(key);
  if (!m || !isOAuthProvider(m[1])) return null;
  return { provider: m[1], step: m[2] as "start" | "callback" };
}
