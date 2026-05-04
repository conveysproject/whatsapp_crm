import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invitations/(.*)/accept",
]);

// Routes that are part of the setup flow itself — don't redirect these to /business-details
const isSetupRoute = createRouteMatcher(["/business-details(.*)"]);

// API routes run server-side and manage their own auth — skip the cookie gate
const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  // Authenticated users hitting the landing page go straight to the dashboard
  if (userId && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Onboarding gate: authenticated user accessing the app but never completed Step 2
  // → send them back to /business-details so their org/user row gets created.
  // The cookie tc_registered is set by /api/register on successful submission.
  if (
    userId &&
    !isPublicRoute(request) &&
    !isSetupRoute(request) &&
    !isApiRoute(request) &&
    !request.cookies.get("tc_registered")
  ) {
    return NextResponse.redirect(new URL("/business-details", request.url));
  }
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"],
};