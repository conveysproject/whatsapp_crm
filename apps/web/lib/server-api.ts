import { cookies } from "next/headers";

export const IMPERSONATION_COOKIE = "imp_token";

/** Impersonation token from the httpOnly cookie (server components / route handlers only). */
export async function getImpersonationCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(IMPERSONATION_COOKIE)?.value || null;
  } catch {
    return null;
  }
}

/**
 * Auth headers for server-side API calls: the Clerk bearer token, plus the
 * X-Impersonate-Token when an impersonation session cookie is present.
 * The API validates the token; a forged/garbage cookie only yields a 401.
 */
export async function serverApiHeaders(token: string | null | undefined): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token ?? ""}` };
  const imp = await getImpersonationCookie();
  if (imp) headers["X-Impersonate-Token"] = imp;
  return headers;
}
