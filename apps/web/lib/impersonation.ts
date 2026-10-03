/**
 * Pure helpers for super-admin user impersonation (no React, no direct window access
 * except where injected), so the fetch interceptor logic is unit-testable.
 */

export const IMPERSONATION_STORAGE_KEY = "impersonation";
export const IMPERSONATION_HEADER = "X-Impersonate-Token";

export interface ImpersonationSession {
  token: string;
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  mode: "readonly" | "edit";
  /** epoch milliseconds */
  expiresAt: number;
}

export interface InterceptorConfig {
  /** API base URL (NEXT_PUBLIC_API_URL); trailing slash is ignored. */
  apiBase: string;
  /** window.location.origin */
  origin: string;
}

/** Calls that must be made as the REAL super admin, never with the impersonation header. */
const ADMIN_IMPERSONATION_PATH =
  /^(?:\/api)?\/v1\/admin\/(?:impersonation(?:\/|$)|organizations\/[^/]+(?:\/users\/[^/]+)?\/impersonate\/?$)/;

function resolveUrl(input: RequestInfo | URL, origin: string): URL | null {
  try {
    if (typeof input === "string") return new URL(input, origin);
    if (input instanceof URL) return input;
    return new URL(input.url, origin);
  } catch {
    return null;
  }
}

export function shouldAttachImpersonationToken(input: RequestInfo | URL, config: InterceptorConfig): boolean {
  const url = resolveUrl(input, config.origin);
  if (!url) return false;
  if (ADMIN_IMPERSONATION_PATH.test(url.pathname)) return false;

  let api: URL;
  try {
    api = new URL(config.apiBase.replace(/\/+$/, ""));
  } catch {
    api = new URL("http://localhost:4000");
  }
  const apiPath = api.pathname.replace(/\/+$/, "");
  const isApi = url.origin === api.origin && (url.pathname === apiPath || url.pathname.startsWith(`${apiPath}/`));
  const isSameOriginProxy = url.origin === config.origin && url.pathname.startsWith("/api/v1/");
  return isApi || isSameOriginProxy;
}

/** Parse + validate the stored session. Returns null if missing, malformed or expired. */
export function parseImpersonationSession(raw: string | null, now: number = Date.now()): ImpersonationSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<ImpersonationSession>;
    if (!s || typeof s.token !== "string" || !s.token) return null;
    if (typeof s.expiresAt !== "number" || s.expiresAt <= now) return null;
    return {
      token: s.token,
      orgId: String(s.orgId ?? ""),
      orgName: String(s.orgName ?? ""),
      userId: String(s.userId ?? ""),
      userName: String(s.userName ?? ""),
      mode: s.mode === "edit" ? "edit" : "readonly",
      expiresAt: s.expiresAt,
    };
  } catch {
    return null;
  }
}

export const IMPERSONATION_ERROR_MESSAGES: Record<string, string> = {
  IMPERSONATION_READ_ONLY: "This session is read-only. Click \"Enable edit\" in the banner to make changes.",
  IMPERSONATION_BLOCKED: "This action is not allowed while impersonating a user.",
  AUDIT_UNAVAILABLE: "Action blocked: the audit log is unavailable. Try again shortly.",
};

export type ImpersonationErrorHandler = (code: string, message: string) => void;

/**
 * Wrap a fetch implementation so API calls carry the impersonation token.
 * `getToken` is read on every call so an exit/expiry takes effect immediately.
 */
export function createImpersonatingFetch(
  base: typeof fetch,
  getToken: () => string | null,
  config: InterceptorConfig,
  onImpersonationError?: ImpersonationErrorHandler,
): typeof fetch {
  return async function impersonatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = getToken();
    let res: Promise<Response>;
    if (token && shouldAttachImpersonationToken(input, config)) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
      headers.set(IMPERSONATION_HEADER, token);
      if (input instanceof Request) {
        res = base(new Request(input, { ...init, headers }));
      } else {
        res = base(input, { ...init, headers });
      }
    } else {
      res = base(input, init);
      if (!token) return res;
    }
    const response = await res;
    if (token && response.status === 403 && onImpersonationError) {
      // Only inspect responses of calls that carried the token.
      if (shouldAttachImpersonationToken(input, config)) {
        try {
          const body = (await response.clone().json()) as { error?: { code?: string } };
          const code = body?.error?.code;
          if (code && code in IMPERSONATION_ERROR_MESSAGES) {
            onImpersonationError(code, IMPERSONATION_ERROR_MESSAGES[code]!);
          }
        } catch {
          /* non-JSON body: ignore */
        }
      }
    }
    return response;
  };
}
