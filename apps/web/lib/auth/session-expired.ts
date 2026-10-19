import { isPublicAuthPath } from "./provider-logic";
import { safeRedirect } from "./redirect";

/** Where to send a user whose API call returned `status`; null when no redirect applies. */
export function sessionExpiredRedirect(
  status: number,
  path: string | null | undefined,
): string | null {
  if (status !== 401) return null;
  return "/api/auth/session-expired?redirect_url=" + encodeURIComponent(safeRedirect(path ?? null));
}

/** Open-tab liveness check runs only while signed in and off the public auth pages. */
export function shouldRecheckSession(isSignedIn: boolean, pathname: string): boolean {
  return isSignedIn && !isPublicAuthPath(pathname);
}
