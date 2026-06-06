import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invitations/(.*)/accept",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isAdminSignIn = createRouteMatcher(["/admin/sign-in(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  // ── Admin routes ─────────────────────────────────────────────────────────
  if (isAdminRoute(request)) {
    if (isAdminSignIn(request)) return NextResponse.next();
    if (!userId) {
      const signInUrl = new URL("/admin/sign-in", request.url);
      signInUrl.searchParams.set("redirect_url", request.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
    return NextResponse.next();
  }

  // ── Vendor routes ─────────────────────────────────────────────────────────

  // Logged-in users hitting the landing page go straight to the dashboard
  if (userId && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protect all non-public routes with Clerk auth
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Registration gate is handled by the dashboard layout:
  // it calls /v1/organizations/me — if the org doesn't exist it redirects
  // to /business-details. No cookie needed; the DB is the source of truth.
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
};
