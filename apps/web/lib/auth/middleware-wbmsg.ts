// Edge-safe: no Node-only imports.
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, refreshSession, setSessionCookies } from "./bff";
import { COOKIE } from "./config";
import { accessTokenExpiry, verifyAccessToken } from "./jwt";

// Same list as the Clerk middleware (middleware.ts), as regexes.
const PUBLIC: RegExp[] = [
  /^\/$/,
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
  /^\/docs(\/.*)?$/,
  /^\/terms$/,
  /^\/privacy$/,
  /^\/refund-policy$/,
  /^\/cancellation-policy$/,
  /^\/contact$/,
  /^\/sitemap\.xml$/,
  /^\/robots\.txt$/,
  /^\/llms\.txt$/,
  /^\/invitations\/[^/]+\/accept$/,
  /^\/api\/internal\/.*$/,
  /^\/api\/invitations\/.*$/,
];
const isPublic = (p: string) => PUBLIC.some((r) => r.test(p));
const isAdmin = (p: string) => p === "/admin" || p.startsWith("/admin/");
const isAdminSignIn = (p: string) => p === "/admin/sign-in" || p.startsWith("/admin/sign-in/");

const SKEW_MS = 60_000;

async function hasValidAccess(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const exp = accessTokenExpiry(token);
  if (exp === null || exp <= Date.now() + SKEW_MS) return false;
  return (await verifyAccessToken(token)) !== null;
}

function signInRedirect(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const url = new URL(isAdmin(pathname) ? "/admin/sign-in" : "/sign-in", req.url);
  url.searchParams.set("redirect_url", pathname + search);
  return NextResponse.redirect(url);
}

export async function wbmsgMiddleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // /api/auth and the /api/v1 proxy authenticate themselves.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (isAdminSignIn(pathname)) return NextResponse.next();

  const at = req.cookies.get(COOKIE.access)?.value;
  const rt = req.cookies.get(COOKIE.refresh)?.value;

  if (await hasValidAccess(at)) {
    if (pathname === "/") return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  // Public pages other than the landing page never trigger a refresh.
  if (isPublic(pathname) && !(pathname === "/" && rt)) return NextResponse.next();

  if (rt) {
    const result = await refreshSession(rt, req);
    if (result.ok) {
      // Forward the new tokens to this same request's server components.
      const cookies = req.cookies
        .getAll()
        .filter((c) => c.name !== COOKIE.access && c.name !== COOKIE.refresh)
        .map((c) => `${c.name}=${c.value}`);
      cookies.push(`${COOKIE.access}=${result.accessToken}`, `${COOKIE.refresh}=${result.refreshToken}`);
      const headers = new Headers(req.headers);
      headers.set("cookie", cookies.join("; "));
      const res =
        pathname === "/"
          ? NextResponse.redirect(new URL("/dashboard", req.url))
          : NextResponse.next({ request: { headers } });
      setSessionCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      return res;
    }
    // Transient failure: do not sign the user out.
    if (result.status === 503) return NextResponse.next();
    // Rejected refresh token: a public page stays reachable, a protected one goes to sign-in.
    const res = isPublic(pathname) ? NextResponse.next() : signInRedirect(req);
    clearSessionCookies(res);
    return res;
  }

  return signInRedirect(req);
}
