import { type NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_COOKIE, IMPERSONATION_META_COOKIE } from "../../../../lib/server-api";
import { impersonationExitPath } from "../../../../lib/impersonation";

/**
 * Clears a stale/revoked impersonation session (both cookies) and sends the admin back
 * to where it started (platform admin area, or /parent for a parent-issued session). Used by the dashboard layout when the org fetch fails while
 * the imp_token cookie is set. Idempotent; it only ever removes cookies.
 */
export function GET(request: NextRequest): NextResponse {
  let source: "parent" | undefined;
  try {
    const meta = JSON.parse(request.cookies.get(IMPERSONATION_META_COOKIE)?.value ?? "{}") as { source?: unknown };
    if (meta.source === "parent") source = "parent";
  } catch { /* unreadable meta: default to the admin area */ }
  const res = NextResponse.redirect(new URL(impersonationExitPath({ source, orgId: "" }), request.url));
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
