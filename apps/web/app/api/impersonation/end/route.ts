import { type NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_COOKIE, IMPERSONATION_META_COOKIE } from "../../../../lib/server-api";

/**
 * Clears a stale/revoked impersonation session (both cookies) and sends the admin back
 * to the platform admin area. Used by the dashboard layout when the org fetch fails while
 * the imp_token cookie is set. Idempotent; it only ever removes cookies.
 */
export function GET(request: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL("/admin/organizations", request.url));
  const opts = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(IMPERSONATION_COOKIE, "", opts);
  res.cookies.set(IMPERSONATION_META_COOKIE, "", opts);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
