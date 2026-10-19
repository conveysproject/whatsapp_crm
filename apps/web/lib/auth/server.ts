import { redirect } from "next/navigation";
import { COOKIE } from "./config";
import { verifyAccessToken } from "./jwt";
import { safeRedirect } from "./redirect";

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

async function authImpl() {
  return wbmsgAuth();
}

// Role/permission checks are done by the API, so protect() takes no arguments.
async function protectImpl() {
  const a = await wbmsgAuth();
  if (!a.userId) {
    // x-pathname is optional (set by middleware when available); fall back to plain /sign-in.
    const { headers } = await import("next/headers");
    const path = (await headers()).get("x-pathname");
    redirect(path && safeRedirect(path, "") === path ? `/sign-in?redirect_url=${encodeURIComponent(path)}` : "/sign-in");
  }
  return a;
}

export const auth = Object.assign(authImpl, { protect: protectImpl });
