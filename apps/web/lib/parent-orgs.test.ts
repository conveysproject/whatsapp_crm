import { describe, it, expect, vi, afterEach } from "vitest";
import type { CurrentUser } from "./can";
import {
  FULL_READ_ACCESS_SENTENCE, NOT_AVAILABLE_MESSAGE, ParentApiError, acceptClientInvitation, acceptClientInvitationNewAccount,
  acceptViewMode, buildAcceptBody, buildNewAccountAcceptBody, capabilityErrorMessage,
  confirmReducer, describeError, fetchParentDashboard, fetchParentLink, inviteClient, leaveParent, lastDaysRange, openChildAsAdmin, removeChild,
  revokeInvite, runConfirmed, setParentCapability, showClientsNav, showParentLinkCard, totalsFailureRate,
} from "./parent-orgs";

const user = (role: string): CurrentUser => ({ id: "u", organizationId: "o", fullName: "U", email: "u@x.io", role, permissions: {} });

function stubFetch(status: number, body: unknown) {
  const f = vi.fn(async (..._a: unknown[]) => new Response(status === 204 ? null : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe("showClientsNav", () => {
  it("shows for the admin of a parent org", () => {
    expect(showClientsNav(user("admin"), { isParent: true })).toBe(true);
  });
  it("is hidden without isParent", () => {
    expect(showClientsNav(user("admin"), { isParent: false, hasParent: true })).toBe(false);
    expect(showClientsNav(user("admin"), {})).toBe(false);
    expect(showClientsNav(user("admin"), null)).toBe(false);
  });
  it("is hidden for non-admins, even in a parent org", () => {
    for (const role of ["manager", "agent", "whatsappAdmin"]) expect(showClientsNav(user(role), { isParent: true })).toBe(false);
    expect(showClientsNav(null, { isParent: true })).toBe(false);
  });
});

describe("showParentLinkCard", () => {
  it("shows only to the admin of a child org", () => {
    expect(showParentLinkCard(user("admin"), { hasParent: true })).toBe(true);
    expect(showParentLinkCard(user("manager"), { hasParent: true })).toBe(false);
    expect(showParentLinkCard(user("admin"), { hasParent: false })).toBe(false);
  });
});

describe("overview data", () => {
  it("requests the dashboard for the given range and unwraps data", async () => {
    const data = { range: { from: "a", to: "b" }, totals: { sent: 3, delivered: 2, read: 1, failed: 1, received: 4 }, children: [] };
    const f = stubFetch(200, { data });
    const range = lastDaysRange(30, new Date("2026-10-20T00:00:00.000Z"));
    expect(range.from).toBe("2026-09-20T00:00:00.000Z");
    expect(await fetchParentDashboard(range)).toEqual(data);
    expect(f.mock.calls[0]![0]).toBe(`/api/v1/parent/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
  });
  it("failure rate of the totals row is failed / (sent + failed)", () => {
    expect(totalsFailureRate({ sent: 90, delivered: 0, read: 0, failed: 10, received: 0 })).toBe(0.1);
    expect(totalsFailureRate({ sent: 0, delivered: 0, read: 0, failed: 0, received: 5 })).toBe(0);
  });
  it("maps a 404 (flag off) to the same not-available text", async () => {
    stubFetch(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    await expect(fetchParentDashboard(lastDaysRange(7))).rejects.toSatisfy((e: unknown) => describeError(e) === NOT_AVAILABLE_MESSAGE);
  });
});

describe("openChildAsAdmin", () => {
  it("calls the impersonate route, then enters the existing impersonation state (cookie + sessionStorage)", async () => {
    const f = stubFetch(200, { data: { token: "tok-123456789", expiresIn: 900, mode: "readonly" } });
    const setCookie = vi.fn(async () => true);
    const setItem = vi.fn();
    const session = await openChildAsAdmin({ orgId: "c1", name: "Client One" }, { setCookie, storage: { setItem }, now: () => 1_000 });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/parent/children/c1/impersonate");
    expect(init.method).toBe("POST");
    expect(session).toMatchObject({ token: "tok-123456789", orgId: "c1", orgName: "Client One", mode: "readonly", source: "parent", expiresAt: 901_000 });
    expect(setCookie).toHaveBeenCalledWith(session);
    expect(setItem).toHaveBeenCalledWith("impersonation", JSON.stringify(session));
    expect(setCookie.mock.invocationCallOrder[0]).toBeLessThan(setItem.mock.invocationCallOrder[0]!);
  });
  it("does not enter the state when the API refuses", async () => {
    stubFetch(403, { error: { code: "FORBIDDEN_CHILD", message: "Not available" } });
    const setCookie = vi.fn(async () => true);
    const setItem = vi.fn();
    await expect(openChildAsAdmin({ orgId: "c1", name: "C" }, { setCookie, storage: { setItem } })).rejects.toBeInstanceOf(ParentApiError);
    expect(setCookie).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
  it("does not keep a session in this tab when the cookie cannot be saved", async () => {
    stubFetch(200, { data: { token: "tok-123456789", expiresIn: 900, mode: "readonly" } });
    const setItem = vi.fn();
    await expect(openChildAsAdmin({ orgId: "c1", name: "C" }, { setCookie: async () => false, storage: { setItem } })).rejects.toBeInstanceOf(ParentApiError);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("invite client", () => {
  it("posts the trimmed email", async () => {
    const f = stubFetch(201, { data: { id: "i1" }, emailSent: true });
    expect(await inviteClient("  new@client.io ")).toEqual({ emailSent: true });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/client-invitations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ email: "new@client.io" });
  });
  it("surfaces the server message for a duplicate invite", async () => {
    stubFetch(409, { error: { code: "INVITE_EXISTS", message: "A pending invitation for this email already exists." } });
    await expect(inviteClient("a@b.io")).rejects.toSatisfy((e: unknown) => describeError(e) === "A pending invitation for this email already exists.");
  });
  it("revokes by id with DELETE", async () => {
    const f = stubFetch(204, null);
    await revokeInvite("i 1");
    expect(f.mock.calls[0]![0]).toBe("/api/v1/client-invitations/i%201");
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
});

describe("accept page", () => {
  it("the access sentence says the parent has full read access and can open it as an admin", () => {
    expect(FULL_READ_ACCESS_SENTENCE).toMatch(/full read access/);
    expect(FULL_READ_ACCESS_SENTENCE).toMatch(/open it as an admin/);
  });
  it("builds the body: trimmed, optional mobile only when given", () => {
    expect(buildAcceptBody({ fullName: " Ann ", organizationName: " Acme ", mobileNumber: "  " })).toEqual({ fullName: "Ann", organizationName: "Acme" });
    expect(buildAcceptBody({ fullName: "Ann", organizationName: "Acme", mobileNumber: " +4412345 " })).toEqual({ fullName: "Ann", organizationName: "Acme", mobileNumber: "+4412345" });
  });
  it("posts the body with the bearer token to the accept route", async () => {
    const f = stubFetch(201, { data: { organizationId: "o9" } });
    await acceptClientInvitation("http://api.test/", "tk 1", "access-tok", { fullName: "Ann", organizationName: "Acme" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/client-invitations/tk%201/accept");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer access-tok");
    expect(JSON.parse(init.body as string)).toEqual({ fullName: "Ann", organizationName: "Acme" });
  });
  it("fetchParentLink defaults contentReads to an empty list for an older API", async () => {
    stubFetch(200, { data: { parent: { name: "P" }, sessions: [] } });
    expect((await fetchParentLink()).contentReads).toEqual([]);
    stubFetch(200, { data: { parent: { name: "P" }, sessions: [], contentReads: [{ at: "2026-10-19T08:00:00.000Z", actorName: "A", count: 3 }] } });
    expect((await fetchParentLink()).contentReads).toEqual([{ at: "2026-10-19T08:00:00.000Z", actorName: "A", count: 3 }]);
  });
  it("chooses the branch: signed in -> accept form; signed out -> new-account form unless an account exists", () => {
    const meta = { parentName: "P", email: "e@x.io" };
    expect(acceptViewMode({ ...meta, accountExists: false }, true)).toBe("signedIn");
    expect(acceptViewMode({ ...meta, accountExists: true }, true)).toBe("signedIn");
    expect(acceptViewMode({ ...meta, accountExists: false }, false)).toBe("newAccount");
    expect(acceptViewMode({ ...meta, accountExists: true }, false)).toBe("signIn");
    // Unknown (older API): never offer a password form that could not work; fall back to sign in.
    expect(acceptViewMode(meta, false)).toBe("signIn");
  });
  it("new account: builds a trimmed body with the password untouched and mobile only when given", () => {
    expect(buildNewAccountAcceptBody({ firstName: " Ann ", lastName: " Lee ", password: " pw with spaces ", organizationName: " Acme ", mobileNumber: " " }))
      .toEqual({ firstName: "Ann", lastName: "Lee", password: " pw with spaces ", organizationName: "Acme" });
    expect(buildNewAccountAcceptBody({ firstName: "A", lastName: "B", password: "p", organizationName: "C", mobileNumber: " +44 1 " }))
      .toEqual({ firstName: "A", lastName: "B", password: "p", organizationName: "C", mobileNumber: "+44 1" });
  });
  it("new account: posts to the same-origin auth proxy (cookies set there), no bearer", async () => {
    const f = stubFetch(201, { organizationId: "o9" });
    const step = await acceptClientInvitationNewAccount("tk 1", { firstName: "Ann", lastName: "Lee", password: "correct horse", organizationName: "Acme" });
    expect(step).toEqual({ kind: "done" });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/client-invitations/accept/tk%201");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ firstName: "Ann", lastName: "Lee", password: "correct horse", organizationName: "Acme" });
  });
  it("new account: maps ACCOUNT_EXISTS, WEAK_PASSWORD and an invalid link", async () => {
    stubFetch(409, { error: { code: "ACCOUNT_EXISTS", message: "x" } });
    expect(await acceptClientInvitationNewAccount("t", { firstName: "A", lastName: "B", password: "p", organizationName: "C" })).toEqual({ kind: "account_exists" });
    stubFetch(400, { error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." } });
    expect(await acceptClientInvitationNewAccount("t", { firstName: "A", lastName: "B", password: "p", organizationName: "C" })).toEqual({ kind: "error", message: "Use 8 to 128 characters." });
    stubFetch(400, { error: { code: "INVALID_INVITATION", message: "x" } });
    expect(await acceptClientInvitationNewAccount("t", { firstName: "A", lastName: "B", password: "p", organizationName: "C" })).toEqual({ kind: "error", message: "This invitation link is invalid or has expired." });
    stubFetch(409, { error: { code: "PARENT_UNAVAILABLE", message: "x" } });
    expect(await acceptClientInvitationNewAccount("t", { firstName: "A", lastName: "B", password: "p", organizationName: "C" })).toEqual({ kind: "error", message: "The inviting company can no longer accept client accounts." });
  });
  it("explains an email mismatch in plain words", async () => {
    stubFetch(403, { error: { code: "EMAIL_MISMATCH", message: "x" } });
    await expect(acceptClientInvitation("http://api.test", "t", "a", { fullName: "A", organizationName: "B" }))
      .rejects.toMatchObject({ message: expect.stringContaining("different email") });
  });
});

describe("destructive actions need confirmation", () => {
  it("runConfirmed never runs from idle, and runs once confirming", async () => {
    const act = vi.fn(async () => undefined);
    expect(await runConfirmed("idle", act)).toBe(false);
    expect(await runConfirmed("running", act)).toBe(false);
    expect(act).not.toHaveBeenCalled();
    expect(await runConfirmed("confirming", act)).toBe(true);
    expect(act).toHaveBeenCalledTimes(1);
  });
  it("the reducer goes idle -> confirming -> running; confirm from idle does nothing", () => {
    expect(confirmReducer("idle", "confirm")).toBe("idle");
    expect(confirmReducer("idle", "request")).toBe("confirming");
    expect(confirmReducer("confirming", "cancel")).toBe("idle");
    expect(confirmReducer("confirming", "confirm")).toBe("running");
    expect(confirmReducer("running", "cancel")).toBe("running");
    expect(confirmReducer("running", "done")).toBe("idle");
  });
  it("remove client and leave use DELETE / POST on the right routes", async () => {
    const f = stubFetch(200, { data: {} });
    await removeChild("c1");
    await leaveParent();
    expect(f.mock.calls[0]![0]).toBe("/api/v1/parent/children/c1");
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
    expect(f.mock.calls[1]![0]).toBe("/api/v1/organization/leave-parent");
    expect((f.mock.calls[1]![1] as RequestInit).method).toBe("POST");
  });
});

describe("setParentCapability", () => {
  it("PATCHes the toggle with the admin bearer token", async () => {
    const f = stubFetch(200, { data: { id: "o1", isParent: true } });
    await setParentCapability("http://api.test/", "adm", "o1", true);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/admin/organizations/o1/parent-capability");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer adm");
    expect(JSON.parse(init.body as string)).toEqual({ enabled: true });
  });
  it("turns the 409 codes into readable messages", async () => {
    stubFetch(409, { error: { code: "HAS_CHILDREN", message: "Unlink all child organizations first" } });
    await expect(setParentCapability("http://api.test", "a", "o1", false)).rejects.toMatchObject({ message: expect.stringContaining("still has clients") });
    stubFetch(409, { error: { code: "IS_CHILD", message: "x" } });
    await expect(setParentCapability("http://api.test", "a", "o1", true)).rejects.toMatchObject({ message: expect.stringContaining("client of another organization") });
  });
  it("says not available when the feature is off (404)", async () => {
    stubFetch(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    await expect(setParentCapability("http://api.test", "a", "o1", true)).rejects.toMatchObject({ message: NOT_AVAILABLE_MESSAGE });
  });
});

describe("super admin capability messages", () => {
  it("explains IS_CHILD and HAS_CHILDREN", () => {
    expect(capabilityErrorMessage("IS_CHILD")).toMatch(/client of another organization/);
    expect(capabilityErrorMessage("HAS_CHILDREN")).toMatch(/still has clients/);
    expect(capabilityErrorMessage("OTHER")).toBe("Could not update this setting.");
  });
});
