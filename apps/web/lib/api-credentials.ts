/**
 * Client helpers for the Plivo-compatible API credentials endpoints
 * (`/api/v1/api-credentials`). Pure functions + thin fetch wrappers so the logic is
 * unit-testable. Secrets (authToken) are returned to callers only and never cached here.
 */

export interface ApiCredential {
  id: string;
  name: string;
  callbackUrl: string | null;
  inboundUrl: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface RevealedCredential {
  authId: string;
  authToken: string;
  name: string;
}

export interface CredentialInput {
  name: string;
  callbackUrl: string;
  inboundUrl: string;
}

export const NAME_MAX = 100;
export const URL_MAX = 2048;

export class ApiCredentialsError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiCredentialsError";
    this.code = code;
    this.status = status;
  }
}

export type CredentialFormErrors = Partial<Record<keyof CredentialInput, string>>;

function validateUrl(value: string, label: string): string | undefined {
  const v = value.trim();
  if (v === "") return undefined;
  if (v.length > URL_MAX) return `${label} must be at most ${URL_MAX} characters.`;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return `${label} must be a valid URL.`;
  }
  if (parsed.protocol !== "https:") return `${label} must start with https://`;
  return undefined;
}

export function validateCredentialInput(input: CredentialInput): CredentialFormErrors {
  const errors: CredentialFormErrors = {};
  const name = input.name.trim();
  if (name.length === 0) errors.name = "Name is required.";
  else if (name.length > NAME_MAX) errors.name = `Name must be at most ${NAME_MAX} characters.`;
  const cb = validateUrl(input.callbackUrl, "Callback URL");
  if (cb) errors.callbackUrl = cb;
  const inb = validateUrl(input.inboundUrl, "Inbound URL");
  if (inb) errors.inboundUrl = inb;
  return errors;
}

/** Human-readable message for any thrown value; never exposes raw objects or stacks. */
export function messageForError(err: unknown): string {
  if (err instanceof ApiCredentialsError) {
    if (err.code === "PLAN_REQUIRED") return "API access is not enabled for your plan. Contact support to enable it.";
    if (err.code === "NOT_CONFIGURED") return "API credentials are temporarily unavailable. Please contact support.";
    if (err.code === "FORBIDDEN") return "You do not have permission to manage API credentials.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/api-credentials${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiCredentialsError("NETWORK", "Network error. Check your connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof e?.code === "string" ? e.code : "UNKNOWN";
    const message = typeof e?.message === "string" ? e.message : `Request failed (${res.status}).`;
    throw new ApiCredentialsError(code, message, res.status);
  }
  return (body as { data: T }).data;
}

function urlOrNull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export function listCredentials(): Promise<ApiCredential[]> {
  return request<ApiCredential[]>("");
}

export async function createCredential(input: CredentialInput): Promise<RevealedCredential> {
  const body: Record<string, string> = { name: input.name.trim() };
  const cb = urlOrNull(input.callbackUrl);
  const inb = urlOrNull(input.inboundUrl);
  if (cb) body["callbackUrl"] = cb;
  if (inb) body["inboundUrl"] = inb;
  const r = await request<{ authId: string; authToken: string; name: string }>("", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { authId: r.authId, authToken: r.authToken, name: r.name };
}

export async function updateCredential(id: string, input: CredentialInput): Promise<void> {
  await request<ApiCredential>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name.trim(),
      callbackUrl: urlOrNull(input.callbackUrl),
      inboundUrl: urlOrNull(input.inboundUrl),
    }),
  });
}

export async function rotateCredential(id: string, name: string): Promise<RevealedCredential> {
  const r = await request<{ authId: string; authToken: string }>(`/${encodeURIComponent(id)}/rotate`, { method: "POST" });
  return { authId: r.authId, authToken: r.authToken, name };
}

export async function revokeCredential(id: string): Promise<void> {
  await request<void>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** `<host>/v1/Account/<authId>/Message/`; host omitted when unknown. */
export function buildMessageEndpoint(apiHost: string | undefined, authId: string): string {
  const path = `/v1/Account/${authId}/Message/`;
  const host = (apiHost ?? "").trim().replace(/\/+$/, "");
  return host ? `${host}${path}` : path;
}

export function formatLastUsed(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "Never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Never";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(t).toLocaleDateString();
}

export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString();
}
