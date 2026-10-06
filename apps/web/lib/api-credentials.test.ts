import { describe, it, expect, vi, afterEach } from "vitest";
import {
  validateCredentialInput,
  buildMessageEndpoint,
  formatLastUsed,
  createCredential,
  updateCredential,
  rotateCredential,
  revokeCredential,
  listCredentials,
  messageForError,
  ApiCredentialsError,
} from "./api-credentials";

function mockFetch(status: number, body?: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("validateCredentialInput", () => {
  const ok = { name: "Prod", callbackUrl: "", inboundUrl: "" };
  it("accepts name only", () => expect(validateCredentialInput(ok)).toEqual({}));
  it("requires a name", () => expect(validateCredentialInput({ ...ok, name: "  " }).name).toMatch(/required/i));
  it("rejects name over 100 chars", () => expect(validateCredentialInput({ ...ok, name: "a".repeat(101) }).name).toBeDefined());
  it("rejects non-https urls", () => {
    const e = validateCredentialInput({ ...ok, callbackUrl: "http://x.com", inboundUrl: "ftp://x" });
    expect(e.callbackUrl).toMatch(/https/);
    expect(e.inboundUrl).toMatch(/https/);
  });
  it("rejects garbage and over-long urls", () => {
    expect(validateCredentialInput({ ...ok, callbackUrl: "not a url" }).callbackUrl).toMatch(/valid/);
    expect(validateCredentialInput({ ...ok, inboundUrl: "https://x.com/" + "a".repeat(2048) }).inboundUrl).toMatch(/2048/);
  });
  it("accepts https urls", () =>
    expect(validateCredentialInput({ ...ok, callbackUrl: "https://example.com/cb" })).toEqual({}));
});

describe("buildMessageEndpoint / formatLastUsed", () => {
  it("builds with host", () => expect(buildMessageEndpoint("https://api.x.com/", "MA1")).toBe("https://api.x.com/v1/Account/MA1/Message/"));
  it("path only without host", () => expect(buildMessageEndpoint(undefined, "MA1")).toBe("/v1/Account/MA1/Message/"));
  it("Never for null", () => expect(formatLastUsed(null)).toBe("Never"));
  it("relative", () => {
    const now = Date.parse("2026-01-02T00:00:00Z");
    expect(formatLastUsed("2026-01-01T22:00:00Z", now)).toBe("2h ago");
  });
});

describe("api calls", () => {
  it("lists", async () => {
    const f = mockFetch(200, { data: [{ id: "1" }] });
    expect(await listCredentials()).toEqual([{ id: "1" }]);
    expect(f.mock.calls[0]![0]).toBe("/api/v1/api-credentials");
  });
  it("creates, omitting empty urls", async () => {
    const f = mockFetch(201, { data: { authId: "A", authToken: "T", name: "n" } });
    const r = await createCredential({ name: " n ", callbackUrl: "", inboundUrl: "https://i.com" });
    expect(r).toEqual({ authId: "A", authToken: "T", name: "n" });
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "n", inboundUrl: "https://i.com" });
  });
  it("update sends null for cleared urls", async () => {
    const f = mockFetch(200, { data: {} });
    await updateCredential("id1", { name: "n", callbackUrl: "", inboundUrl: "" });
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "n", callbackUrl: null, inboundUrl: null });
  });
  it("rotates and revokes with the right endpoints", async () => {
    let f = mockFetch(200, { data: { authId: "A", authToken: "NEW" } });
    expect((await rotateCredential("id1", "n")).authToken).toBe("NEW");
    expect(f.mock.calls[0]![0]).toBe("/api/v1/api-credentials/id1/rotate");
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    f = mockFetch(204);
    await revokeCredential("id1");
    expect(f.mock.calls[0]![0]).toBe("/api/v1/api-credentials/id1");
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });
  it("surfaces server error code and message", async () => {
    mockFetch(400, { error: { code: "INVALID_URL", message: "callbackUrl must be public https" } });
    const err = await createCredential({ name: "n", callbackUrl: "https://x.com", inboundUrl: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiCredentialsError);
    expect((err as ApiCredentialsError).code).toBe("INVALID_URL");
    expect(messageForError(err)).toBe("callbackUrl must be public https");
  });
  it("shows the server's CREDENTIAL_LIMIT message and no longer special-cases PLAN_REQUIRED", async () => {
    const message = "You can have at most 10 active credentials. Revoke one first.";
    mockFetch(409, { error: { code: "CREDENTIAL_LIMIT", message } });
    const err = await createCredential({ name: "n", callbackUrl: "", inboundUrl: "" }).catch((e: unknown) => e);
    expect((err as ApiCredentialsError).code).toBe("CREDENTIAL_LIMIT");
    expect(messageForError(err)).toBe(message);
    expect(messageForError(new ApiCredentialsError("PLAN_REQUIRED", "raw", 403))).toBe("raw");
  });
  it("never leaks raw objects for unknown errors", () => {
    expect(messageForError({ weird: true })).toMatch(/try again/i);
  });
  it("shows impersonation message from server", async () => {
    mockFetch(403, { error: { code: "IMPERSONATION_READ_ONLY", message: "Read-only session" } });
    const err = await revokeCredential("x").catch((e: unknown) => e);
    expect(messageForError(err)).toBe("Read-only session");
  });
});
