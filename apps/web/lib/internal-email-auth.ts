import { authProvider } from "./auth/config";
import { verifyAccessToken } from "./auth/jwt";

/**
 * Authorizes callers of the transactional email bridge.
 *  - JWT-looking token: own access token (wbmsg mode) or Clerk JWT (clerk mode)
 *  - otherwise / fallthrough: INTERNAL_EMAIL_SECRET for Railway workers (both modes)
 */
export async function isAuthorized(token: string): Promise<boolean> {
  if (!token) return false;

  if (token.startsWith("eyJ")) {
    if (authProvider() === "wbmsg") {
      if ((await verifyAccessToken(token)) !== null) return true;
    } else {
      const secretKey = process.env["CLERK_SECRET_KEY"];
      if (secretKey) {
        try {
          // Lazy import: a wbmsg build without Clerk keys never loads Clerk.
          const { verifyToken } = await import("@clerk/nextjs/server");
          const payload = await verifyToken(token, { secretKey });
          if (payload?.sub) return true;
        } catch { /* invalid JWT — fall through */ }
      }
    }
  }

  const secret = process.env["INTERNAL_EMAIL_SECRET"];
  if (secret && secret.length >= 32) return timingSafeEqual(token, secret);

  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let diff = 0;
    for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}
