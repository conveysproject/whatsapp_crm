// Web helpers for parent/child organizations (docs/prd-parent-child-orgs.md).
// The API is the security boundary (flag, parent_access, parent org, admin role); everything here
// only decides what to show and shapes requests. No UI, so it is unit-testable.
import { isAdmin, type CurrentUser } from "./can";
import { IMPERSONATION_STORAGE_KEY, type ImpersonationSession } from "./impersonation";
import { invitationNextStep, type InvitationStep } from "./auth/invitation";

/** D12: shown wherever a client is invited or linked. Keep the wording identical on every surface. */
export const FULL_READ_ACCESS_SENTENCE =
  "The inviting company will have full read access to the new account, including its conversations, contacts and settings, and can open it as an admin.";
export const CONTENT_READ_LOGGED_NOTICE =
  "Reading messages is logged. Every time you load messages, a record is saved with your name, the client and the time, and the client can see it.";
export const NOT_AVAILABLE_MESSAGE = "This feature is not available for your account.";

export interface OrgFlags {
  isParent?: boolean;
  hasParent?: boolean;
}

/** The Clients nav entry: only a parent organization's admin. */
export function showClientsNav(user: CurrentUser | null | undefined, org: OrgFlags | null | undefined): boolean {
  return !!user && !!org && org.isParent === true && isAdmin(user);
}

/** The "Linked to" card on the child side: org admins only (the API allows only the admin role). */
export function showParentLinkCard(user: CurrentUser | null | undefined, org: OrgFlags | null | undefined): boolean {
  return !!user && !!org && org.hasParent === true && user.role === "admin";
}

export class ParentApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ParentApiError";
  }
}

/** Plain-language text for a failed call. 404 = flag off (same "not available" state used elsewhere). */
export function describeError(err: unknown): string {
  if (err instanceof ParentApiError) {
    if (err.status === 404) return NOT_AVAILABLE_MESSAGE;
    if (err.status === 403) return "You do not have permission to do this.";
    if (err.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (err.message) return err.message;
  }
  return "Something went wrong. Please try again.";
}

const CAPABILITY_MESSAGES: Record<string, string> = {
  IS_CHILD: "This organization is a client of another organization, so it cannot have clients of its own.",
  HAS_CHILDREN: "This organization still has clients. Remove or unlink all of them first.",
};
export function capabilityErrorMessage(code: string | undefined, fallback = "Could not update this setting."): string {
  return (code && CAPABILITY_MESSAGES[code]) || fallback;
}

/** Super admin: allow or stop an organization from having clients. 409 IS_CHILD / HAS_CHILDREN get plain messages. */
export async function setParentCapability(apiBase: string, accessToken: string, orgId: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/admin/organizations/${encodeURIComponent(orgId)}/parent-capability`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const e = await readError(res);
    throw new ParentApiError(e.status, e.code, e.status === 404 ? NOT_AVAILABLE_MESSAGE : capabilityErrorMessage(e.code, e.message));
  }
}

async function readError(res: Response): Promise<ParentApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new ParentApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? `Request failed (${res.status})`);
}

/** Same-origin proxy call (cookie session; the impersonation interceptor and proxy add the rest). */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Types (mirror apps/api/src/lib/parent-dashboard-queries.ts and the route files) ──────────
export interface ChildRow {
  orgId: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  received: number;
  failureRate: number;
  lastActivityAt: string | null;
  wabaConnected: boolean;
}
export interface Totals { sent: number; delivered: number; read: number; failed: number; received: number }
export interface ParentDashboard { range: { from: string; to: string }; totals: Totals; children: ChildRow[] }
export interface ChildMessage {
  id: string;
  direction: string;
  contentType: string;
  body: string | null;
  status: string;
  sentAt: string;
  contactPhone: string | null;
  contactName: string | null;
}
export interface ClientInvite { id: string; email: string; status: string; expiresAt: string; createdAt: string }
export interface ParentSession { id: string; startedAt: string; endedAt: string | null; mode: string; actorName: string }
export interface ParentLink { parent: { name: string } | null; sessions: ParentSession[] }

export interface DateRange { from: string; to: string }
export const DEFAULT_RANGE_DAYS = 30;
/** Last `days` days up to `now`, as ISO strings (the API default is 30 days, max 366). */
export function lastDaysRange(days: number, now: Date = new Date()): DateRange {
  return { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: now.toISOString() };
}
const rangeQs = (r: DateRange) => `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;

// ── Parent side ────────────────────────────────────────────────────────────────────────────
export async function fetchParentDashboard(range: DateRange): Promise<ParentDashboard> {
  return (await call<{ data: ParentDashboard }>(`/parent/dashboard?${rangeQs(range)}`)).data;
}
export async function fetchChildStats(childId: string, range: DateRange): Promise<ChildRow> {
  return (await call<{ data: ChildRow }>(`/parent/children/${encodeURIComponent(childId)}/stats?${rangeQs(range)}`)).data;
}
export async function fetchChildMessages(childId: string, cursor?: string | null): Promise<{ data: ChildMessage[]; nextCursor: string | null }> {
  const qs = `limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  return call(`/parent/children/${encodeURIComponent(childId)}/messages?${qs}`);
}
export async function removeChild(childId: string): Promise<void> {
  await call(`/parent/children/${encodeURIComponent(childId)}`, { method: "DELETE" });
}
export async function fetchInvites(): Promise<ClientInvite[]> {
  return (await call<{ data: ClientInvite[] }>("/client-invitations")).data;
}
export async function inviteClient(email: string): Promise<{ emailSent: boolean }> {
  const r = await call<{ emailSent?: boolean }>("/client-invitations", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
  return { emailSent: r.emailSent === true };
}
export async function revokeInvite(id: string): Promise<void> {
  await call(`/client-invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface OpenAsAdminDeps {
  /** Persists the session in the httpOnly cookies (lib/impersonation.setImpersonationCookie). */
  setCookie: (s: ImpersonationSession) => Promise<boolean>;
  storage: Pick<Storage, "setItem">;
  now?: () => number;
}

/**
 * Start a read-only session on a client, reusing the super-admin impersonation machinery:
 * same session record, same cookies, same banner, same X-Impersonate-Token header.
 */
export async function openChildAsAdmin(child: { orgId: string; name: string }, deps: OpenAsAdminDeps): Promise<ImpersonationSession> {
  const r = await call<{ data: { token: string; expiresIn: number; mode: string } }>(
    `/parent/children/${encodeURIComponent(child.orgId)}/impersonate`,
    { method: "POST", body: JSON.stringify({}) },
  );
  const session: ImpersonationSession = {
    token: r.data.token,
    orgId: child.orgId,
    orgName: child.name,
    userId: "",
    userName: "the client's admin",
    mode: "readonly",
    expiresAt: (deps.now ?? Date.now)() + r.data.expiresIn * 1000,
    source: "parent",
  };
  if (!(await deps.setCookie(session))) throw new ParentApiError(0, "COOKIE", "Could not start the session. Please try again.");
  deps.storage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

// ── Child side ─────────────────────────────────────────────────────────────────────────────
export async function fetchParentLink(): Promise<ParentLink> {
  return (await call<{ data: ParentLink }>("/organization/parent-link")).data;
}
export async function leaveParent(): Promise<void> {
  await call("/organization/leave-parent", { method: "POST" });
}

// ── Public accept page ─────────────────────────────────────────────────────────────────────
export interface ClientInvitationMeta { parentName: string; email: string; accountExists?: boolean }

/**
 * Which accept screen to show. Signed in: the existing accept form (account, no workspace yet).
 * Signed out: a brand-new person sets a password here (the generic sign-up would create an unlinked
 * workspace); someone who already has an account signs in first. Unknown accountExists falls back to sign in.
 */
export type AcceptViewMode = "signedIn" | "signIn" | "newAccount";
export function acceptViewMode(meta: ClientInvitationMeta, signedIn: boolean): AcceptViewMode {
  if (signedIn) return "signedIn";
  return meta.accountExists === false ? "newAccount" : "signIn";
}
export async function fetchClientInvitation(apiBase: string, token: string): Promise<ClientInvitationMeta> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/client-invitations/${encodeURIComponent(token)}`);
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { data: ClientInvitationMeta }).data;
}
export interface AcceptForm { fullName: string; organizationName: string; mobileNumber?: string }
/** Body for POST /client-invitations/:token/accept: trimmed, optional mobile only when filled in. */
export function buildAcceptBody(f: AcceptForm): AcceptForm {
  const mobile = f.mobileNumber?.trim();
  return { fullName: f.fullName.trim(), organizationName: f.organizationName.trim(), ...(mobile ? { mobileNumber: mobile } : {}) };
}
const ACCEPT_ERRORS: Record<string, string> = {
  EMAIL_MISMATCH: "This invitation was sent to a different email address. Sign in with the invited email.",
  ALREADY_MEMBER: "You already belong to a workspace, so this invitation cannot be accepted.",
  INVALID_TOKEN: "This invitation is invalid or has expired.",
  PARENT_UNAVAILABLE: "The inviting company can no longer accept client accounts.",
  UNAUTHORIZED: "Please sign in to accept this invitation.",
};
export async function acceptClientInvitation(apiBase: string, token: string, accessToken: string, form: AcceptForm): Promise<void> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/client-invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(buildAcceptBody(form)),
  });
  if (!res.ok) {
    const e = await readError(res);
    throw new ParentApiError(e.status, e.code, ACCEPT_ERRORS[e.code] ?? e.message);
  }
}

export interface NewAccountForm {
  firstName: string;
  lastName: string;
  password: string;
  organizationName: string;
  mobileNumber?: string;
}
/** Body for the public new-account accept: trimmed names, password as typed, mobile only when given. */
export function buildNewAccountAcceptBody(f: NewAccountForm): NewAccountForm {
  const mobile = f.mobileNumber?.trim();
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    password: f.password,
    organizationName: f.organizationName.trim(),
    ...(mobile ? { mobileNumber: mobile } : {}),
  };
}
/**
 * New person accepts a client invitation: same-origin auth proxy (like the team-invite page), which
 * forwards to POST /v1/auth/client-invitations/:token/accept and stores the session in httpOnly cookies.
 */
export async function acceptClientInvitationNewAccount(token: string, form: NewAccountForm): Promise<InvitationStep> {
  const res = await fetch(`/api/auth/client-invitations/accept/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(buildNewAccountAcceptBody(form)),
  });
  const body: unknown = await res.json().catch(() => null);
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (!res.ok && typeof code === "string" && ACCEPT_ERRORS[code]) return { kind: "error", message: ACCEPT_ERRORS[code] };
  return invitationNextStep(res.status, body);
}

// ── Display helpers (existing metrics only) ────────────────────────────────────────────────
export function formatFailureRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
/** Failure rate of a totals row, same definition as the API: failed / (sent + failed). */
export function totalsFailureRate(t: Totals): number {
  const d = t.sent + t.failed;
  return d > 0 ? Math.round((t.failed / d) * 1000) / 1000 : 0;
}
export function formatWhen(iso: string | null): string {
  if (!iso) return "No activity";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
export function modeLabel(mode: string): string {
  return mode === "edit" ? "Edit" : "Read-only";
}

// ── Two-step confirmation (destructive actions) ────────────────────────────────────────────
export type ConfirmState = "idle" | "confirming" | "running";
export type ConfirmEvent = "request" | "cancel" | "confirm" | "done";
export function confirmReducer(state: ConfirmState, event: ConfirmEvent): ConfirmState {
  switch (event) {
    case "request": return state === "idle" ? "confirming" : state;
    case "cancel": return state === "confirming" ? "idle" : state;
    case "confirm": return state === "confirming" ? "running" : state;
    case "done": return "idle";
  }
}
/** Runs `action` only from the confirming state, so a stray click never reaches the API. */
export async function runConfirmed(state: ConfirmState, action: () => Promise<void>): Promise<boolean> {
  if (state !== "confirming") return false;
  await action();
  return true;
}
