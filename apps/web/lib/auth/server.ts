import { redirect } from "next/navigation";
import { authProvider, COOKIE } from "./config";
import { verifyAccessToken } from "./jwt";

export interface ServerAuth {
  userId: string | null;
  getToken: () => Promise<string | null>;
}

async function wbmsgAuth(): Promise<ServerAuth> {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(COOKIE.access)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  return {
    userId: claims?.userId ?? null,
    getToken: async () => (claims && token ? token : null),
  };
}

// Clerk's call shape is kept as the compile-time type so existing callers
// (including auth.protect() and Clerk-only fields) keep type-checking. In wbmsg
// mode only { userId, getToken } exist; Clerk-only fields are migrated in a later task.
type ClerkAuth = typeof import("@clerk/nextjs/server").auth;

async function authImpl() {
  if (authProvider() === "clerk") {
    return (await import("@clerk/nextjs/server")).auth();
  }
  return wbmsgAuth();
}

// wbmsg mode ignores Clerk-style protect() arguments (role/permission checks are done by the API).
async function protectImpl(...args: unknown[]) {
  if (authProvider() === "clerk") {
    const { auth: clerkAuth } = await import("@clerk/nextjs/server");
    return (clerkAuth.protect as (...a: unknown[]) => unknown)(...args);
  }
  const a = await wbmsgAuth();
  if (!a.userId) {
    // x-pathname is optional (set by middleware when available); fall back to plain /sign-in.
    const { headers } = await import("next/headers");
    const path = (await headers()).get("x-pathname");
    redirect(path && path.startsWith("/") && !path.startsWith("//") ? `/sign-in?redirect_url=${encodeURIComponent(path)}` : "/sign-in");
  }
  return a;
}

export const auth = Object.assign(authImpl, { protect: protectImpl }) as unknown as ClerkAuth;
