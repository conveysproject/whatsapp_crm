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

/** True for calls that must be made as the real admin (elevate/revoke/issue). */
export function isImpersonationAdminPath(pathname: string): boolean {
  return ADMIN_IMPERSONATION_PATH.test(pathname);
}

export function shouldAttachImpersonationToken(input: RequestInfo | URL, config: InterceptorConfig): boolean {
  const url = resolveUrl(input, config.origin);
  if (!url) return false;
  if (isImpersonationAdminPath(url.pathname)) return false;

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

/** Validate an untrusted record. Returns null if malformed, tokenless or expired. */
export function parseSessionObject(value: unknown, now: number = Date.now()): ImpersonationSession | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<ImpersonationSession>;
  if (typeof s.token !== "string" || !s.token) return null;
  if (typeof s.expiresAt !== "number" || !Number.isFinite(s.expiresAt) || s.expiresAt <= now) return null;
  return {
    token: s.token,
    orgId: String(s.orgId ?? "").slice(0, 200),
    orgName: String(s.orgName ?? "").slice(0, 200),
    userId: String(s.userId ?? "").slice(0, 200),
    userName: String(s.userName ?? "").slice(0, 200),
    mode: s.mode === "edit" ? "edit" : "readonly",
    expiresAt: s.expiresAt,
  };
}

/** Parse + validate the stored session. Returns null if missing, malformed or expired. */
export function parseImpersonationSession(raw: string | null, now: number = Date.now()): ImpersonationSession | null {
  if (!raw) return null;
  try {
    return parseSessionObject(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

export type ResyncAction = "none" | "restore" | "clear-local" | "update-local" | "keep";

/**
 * The cookie (remote) is the source of truth; sessionStorage (local) is per tab.
 * Decide how to reconcile them.
 */
export function decideResync(local: ImpersonationSession | null, remote: ImpersonationSession | null): ResyncAction {
  if (!local && !remote) return "none";
  if (!local && remote) return "restore";
  if (local && !remote) return "clear-local";
  if (local!.token !== remote!.token || local!.mode !== remote!.mode || local!.expiresAt !== remote!.expiresAt) return "update-local";
  return "keep";
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
  /** Optional: API calls wait for this (e.g. initial cookie restore) before reading the token. */
  ready?: Promise<unknown>,
): typeof fetch {
  return async function impersonatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (ready && shouldAttachImpersonationToken(input, config)) await ready.catch(() => undefined);
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

/** Persist the session in the httpOnly cookies used by server-rendered pages and other tabs. */
export async function setImpersonationCookie(session: ImpersonationSession): Promise<boolean> {
  try {
    const { token, expiresAt, orgId, orgName, userId, userName, mode } = session;
    const res = await fetch("/api/impersonation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, expiresAt, orgId, orgName, userId, userName, mode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Update the mode in the cookies after a successful elevate (expiry is never extended). */
export async function updateImpersonationCookieMode(mode: "edit"): Promise<boolean> {
  try {
    const res = await fetch("/api/impersonation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Clear both the cookies and sessionStorage. Never throws. */
export async function clearImpersonation(): Promise<void> {
  try { sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY); } catch { /* ignore */ }
  try { await fetch("/api/impersonation", { method: "DELETE" }); } catch { /* ignore */ }
}

function readLocal(): ImpersonationSession | null {
  try { return parseImpersonationSession(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)); } catch { return null; }
}

export interface SyncResult {
  session: ImpersonationSession | null;
  /** True when this tab had a session that the cookie no longer backs (ended elsewhere or expired). */
  ended: boolean;
}

let inFlight: Promise<SyncResult> | null = null;

/** Reconcile this tab's sessionStorage with the cookie (source of truth). Concurrent calls share one request. */
export function syncImpersonation(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<SyncResult> => {
    const local = readLocal();
    let remote: ImpersonationSession | null = null;
    let known = false;
    try {
      const res = await fetch("/api/impersonation", { cache: "no-store" });
      if (res.status === 200) {
        remote = parseSessionObject(await res.json());
        known = true;
      } else if (res.status === 204) {
        known = true;
      }
    } catch {
      /* network error: leave the tab as is */
    }
    if (!known) return { session: local, ended: false };
    const action = decideResync(local, remote);
    try {
      if (action === "restore" || action === "update-local") {
        sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(remote));
      } else if (action === "clear-local") {
        sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      }
    } catch { /* ignore */ }
    return { session: action === "clear-local" ? null : (remote ?? local), ended: action === "clear-local" };
  })().finally(() => { inFlight = null; });
  return inFlight;
}
