// Edge-safe: no Node-only imports.
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, refreshSession, setSessionCookies } from "./bff";
import { COOKIE } from "./config";
import { accessTokenExpiry, verifyAccessToken } from "./jwt";
import { safeRedirect } from "./redirect";

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

// Request headers for the server components: x-pathname carries the current page so a forced
// sign-out can return the user here. Any client-supplied value is dropped; only safe relative paths are set.
function pageHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.delete("x-pathname");
  const { pathname, search } = req.nextUrl;
  const path = pathname + search;
  if (safeRedirect(path, "") === path) headers.set("x-pathname", path);
  return headers;
}

function pass(req: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: pageHeaders(req) } });
}

export async function wbmsgMiddleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // /api/auth and the /api/v1 proxy authenticate themselves.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  if (isAdminSignIn(pathname)) return pass(req);

  const at = req.cookies.get(COOKIE.access)?.value;
  const rt = req.cookies.get(COOKIE.refresh)?.value;

  if (await hasValidAccess(at)) {
    if (pathname === "/") return NextResponse.redirect(new URL("/dashboard", req.url));
    return pass(req);
  }

  // Public pages other than the landing page never trigger a refresh.
  if (isPublic(pathname) && !(pathname === "/" && rt)) return pass(req);

  if (rt) {
    const result = await refreshSession(rt, req);
    if (result.ok) {
      // Forward the new tokens to this same request's server components.
      // Keep the other cookies byte-identical: work on the raw header, not decoded values.
      const cookies = (req.headers.get("cookie") ?? "")
        .split("; ")
        .filter((entry) => {
          if (!entry) return false;
          const name = entry.split("=")[0]!.trim();
          return name !== COOKIE.access && name !== COOKIE.refresh;
        });
      cookies.push(`${COOKIE.access}=${result.accessToken}`, `${COOKIE.refresh}=${result.refreshToken}`);
      const headers = pageHeaders(req);
      headers.set("cookie", cookies.join("; "));
      const res =
        pathname === "/"
          ? NextResponse.redirect(new URL("/dashboard", req.url))
          : NextResponse.next({ request: { headers } });
      setSessionCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      return res;
    }
    // Transient failure: do not sign the user out.
    if (result.status === 503) return pass(req);
    // Rejected refresh token: a public page stays reachable, a protected one goes to sign-in.
    const res = isPublic(pathname) ? pass(req) : signInRedirect(req);
    clearSessionCookies(res);
    return res;
  }

  return signInRedirect(req);
}
