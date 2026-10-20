import { NextRequest, NextResponse } from "next/server";
import {
  callAuthApi,
  clearSessionCookies,
  refreshSession,
  requireSameOrigin,
  setSessionCookies,
  unavailable,
} from "../../../../lib/auth/bff";
import { COOKIE } from "../../../../lib/auth/config";
import { accessTokenExpiry, verifyAccessToken } from "../../../../lib/auth/jwt";
import { safeRedirect } from "../../../../lib/auth/redirect";
import {
  handleMethods,
  handleOAuthCallback,
  handleOAuthPending,
  handleOAuthStart,
  matchOAuthKey,
} from "../../../../lib/auth/oauth-bff";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const notFound = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });

interface Spec {
  api: string;
  client?: boolean;
  device?: boolean;
  cookies?: boolean;
}
const ACTIONS: Record<string, Spec> = {
  "sign-up": { api: "/v1/auth/signup" },
  "sign-up/verify": { api: "/v1/auth/signup/verify", client: true, cookies: true },
  "sign-in/password": { api: "/v1/auth/signin/password", client: true, device: true, cookies: true },
  "sign-in/new-device": { api: "/v1/auth/signin/new-device", client: true, cookies: true },
  "sign-in/code/request": { api: "/v1/auth/signin/code/request" },
  "sign-in/code/verify": { api: "/v1/auth/signin/code/verify", client: true, cookies: true },
  "sign-in/whatsapp/request": { api: "/v1/auth/signin/whatsapp/request" },
  "sign-in/whatsapp/verify": { api: "/v1/auth/signin/whatsapp/verify", client: true, cookies: true },
  "password/forgot": { api: "/v1/auth/password/forgot" },
  "password/reset": { api: "/v1/auth/password/reset", client: true, cookies: true },
};
const INVITE = /^invitations\/accept\/([A-Za-z0-9-]{1,100})$/;
const CLIENT_INVITE = /^client-invitations\/accept\/([A-Za-z0-9-]{1,100})$/;

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b = (await req.json()) as unknown;
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function forward(req: NextRequest, spec: Spec): Promise<NextResponse> {
  const body = await readBody(req);
  for (const k of ["deviceId", "accessToken", "refreshToken", "client"]) delete body[k];
  if (spec.client) body["client"] = "web";
  if (spec.device) {
    const dev = req.cookies.get(COOKIE.device)?.value;
    if (dev) body["deviceId"] = dev;
  }
  let up: Response;
  try {
    up = await callAuthApi(spec.api, { method: "POST", body, req });
  } catch {
    return unavailable();
  }
  let data: Record<string, unknown> = {};
  try {
    const j = (await up.json()) as unknown;
    if (j && typeof j === "object" && !Array.isArray(j)) data = j as Record<string, unknown>;
  } catch {
    /* empty or non-JSON body */
  }
  const { accessToken, refreshToken, deviceId, ...rest } = data;
  const headers: Record<string, string> = { ...NO_STORE };
  const retryAfter = up.headers.get("retry-after");
  if (retryAfter) headers["Retry-After"] = retryAfter;
  const res = NextResponse.json(rest, { status: up.status, headers });
  if (spec.cookies && up.ok && typeof accessToken === "string" && typeof refreshToken === "string") {
    setSessionCookies(res, {
      accessToken,
      refreshToken,
      deviceId: typeof deviceId === "string" ? deviceId : undefined,
    });
  }
  return res;
}

function tokenResponse(accessToken: string, userId: string, exp: number): NextResponse {
  return NextResponse.json({ accessToken, expiresAt: exp, userId }, { headers: NO_STORE });
}

async function handleToken(req: NextRequest): Promise<NextResponse> {
  const at = req.cookies.get(COOKIE.access)?.value;
  if (at) {
    const exp = accessTokenExpiry(at);
    if (exp !== null && exp > Date.now() + 60_000) {
      const v = await verifyAccessToken(at);
      if (v) return tokenResponse(at, v.userId, exp);
    }
  }
  const rt = req.cookies.get(COOKIE.refresh)?.value;
  if (!rt) return NextResponse.json({ accessToken: null }, { status: 401, headers: NO_STORE });
  const r = await refreshSession(rt, req);
  if (!r.ok) {
    if (r.status === 503) return NextResponse.json({ accessToken: null }, { status: 503, headers: NO_STORE });
    const res = NextResponse.json({ accessToken: null }, { status: 401, headers: NO_STORE });
    clearSessionCookies(res);
    return res;
  }
  const exp = accessTokenExpiry(r.accessToken) ?? Date.now();
  const v = await verifyAccessToken(r.accessToken);
  // The old refresh token is consumed, so the rotated cookies must be persisted either way.
  const res = v
    ? tokenResponse(r.accessToken, v.userId, exp)
    : NextResponse.json({ accessToken: null }, { status: 503, headers: NO_STORE });
  setSessionCookies(res, { accessToken: r.accessToken, refreshToken: r.refreshToken });
  return res;
}

async function handleSignOut(req: NextRequest): Promise<NextResponse> {
  let at = req.cookies.get(COOKIE.access)?.value;
  const rt = req.cookies.get(COOKIE.refresh)?.value;
  try {
    const exp = at ? accessTokenExpiry(at) : null;
    if ((!at || exp === null || exp <= Date.now() + 60_000) && rt) {
      const r = await refreshSession(rt, req);
      at = r.ok ? r.accessToken : undefined;
    }
    await callAuthApi("/v1/auth/signout", { method: "POST", body: {}, req, bearer: at });
  } catch {
    /* ignore upstream failure */
  }
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  clearSessionCookies(res);
  return res;
}

// True when the request comes from this origin (not a third-party page). Fetch Metadata first;
// without it fall back to Origin, then Referer, matched against the app origin. No signal = cross-site.
function isSameSiteRequest(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const allowed = new Set<string>([req.nextUrl.origin]);
  const app = process.env["NEXT_PUBLIC_APP_URL"];
  if (app) {
    try {
      allowed.add(new URL(app).origin);
    } catch {
      /* ignore malformed env */
    }
  }
  const from = req.headers.get("origin") ?? req.headers.get("referer");
  if (!from) return false;
  try {
    return allowed.has(new URL(from).origin);
  } catch {
    return false;
  }
}

// Clears the caller's own cookies, but only for same-site requests so another site cannot force a logout.
function handleSessionExpired(req: NextRequest): NextResponse {
  const target = safeRedirect(req.nextUrl.searchParams.get("redirect_url"));
  const url = new URL("/sign-in", req.url);
  url.searchParams.set("redirect_url", target);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("Cache-Control", "no-store");
  if (isSameSiteRequest(req)) clearSessionCookies(res);
  return res;
}

// Open-tab liveness probe: 200 valid, 401 revoked (cookies cleared), 503 unknown (never sign out).
async function handleSessionCheck(req: NextRequest): Promise<NextResponse> {
  let at = req.cookies.get(COOKIE.access)?.value;
  const rt = req.cookies.get(COOKIE.refresh)?.value;
  let rotated: { accessToken: string; refreshToken: string } | null = null;
  const exp = at ? accessTokenExpiry(at) : null;
  if (!at || exp === null || exp <= Date.now() + 60_000) {
    if (!rt) return signedOut();
    const r = await refreshSession(rt, req);
    if (!r.ok) return r.status === 503 ? checkUnavailable() : signedOut();
    at = r.accessToken;
    rotated = { accessToken: r.accessToken, refreshToken: r.refreshToken };
  }
  let up: Response;
  try {
    up = await callAuthApi("/v1/auth/me/security", { method: "GET", req, bearer: at });
  } catch {
    return withRotation(checkUnavailable(), rotated);
  }
  if (up.status === 401) return signedOut();
  if (!up.ok) return withRotation(checkUnavailable(), rotated);
  return withRotation(NextResponse.json({ ok: true }, { headers: NO_STORE }), rotated);
}

function signedOut(): NextResponse {
  const res = NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  clearSessionCookies(res);
  return res;
}
function checkUnavailable(): NextResponse {
  return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
}
function withRotation(res: NextResponse, t: { accessToken: string; refreshToken: string } | null): NextResponse {
  if (t) setSessionCookies(res, t);
  return res;
}

type Ctx = { params: Promise<{ action: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { action } = await ctx.params;
  const key = action.join("/");
  if (key === "token") return handleToken(req);
  if (key === "session-expired") return handleSessionExpired(req);
  if (key === "session-check") return handleSessionCheck(req);
  if (key === "methods") return handleMethods(req);
  const oauth = matchOAuthKey(key);
  if (oauth?.step === "callback") return handleOAuthCallback(req, oauth.provider);
  return notFound();
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { action } = await ctx.params;
  const key = action.join("/");
  const spec = ACTIONS[key];
  const invite = INVITE.exec(key);
  const clientInvite = CLIENT_INVITE.exec(key);
  const oauth = matchOAuthKey(key);
  const oauthStart = oauth?.step === "start" ? oauth.provider : null;
  const pending = key === "oauth/pending/send" ? "send" : key === "oauth/pending/verify" ? "verify" : null;
  const known =
    key === "sign-out" || spec || invite || key.startsWith("invitations/accept/") ||
    clientInvite || key.startsWith("client-invitations/accept/") || oauthStart || pending;
  if (!known) return notFound();
  if (!requireSameOrigin(req)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bad origin" } }, { status: 403 });
  }
  if (key === "sign-out") return handleSignOut(req);
  if (oauthStart) return handleOAuthStart(req, oauthStart);
  if (pending) return handleOAuthPending(req, pending);
  if (spec) return forward(req, spec);
  if (clientInvite) {
    return forward(req, { api: `/v1/auth/client-invitations/${clientInvite[1]}/accept`, client: true, cookies: true });
  }
  if (!invite) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid invitation" } }, { status: 400 });
  }
  return forward(req, { api: `/v1/auth/invitations/${invite[1]}/accept`, client: true, cookies: true });
}
