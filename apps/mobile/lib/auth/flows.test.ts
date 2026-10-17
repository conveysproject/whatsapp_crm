import { NETWORK_ERROR, finishSignIn, stepFromResponse } from "./flows";

const tokens = { accessToken: "a", refreshToken: "r", expiresIn: 600 };

describe("stepFromResponse", () => {
  it("maps a token response to signed_in, keeping the device id", () => {
    expect(stepFromResponse({ status: 200, body: { ...tokens, deviceId: "d" } })).toEqual({ kind: "signed_in", tokens: { ...tokens, deviceId: "d" } });
  });
  it("maps the API's next steps", () => {
    expect(stepFromResponse({ status: 200, body: { next: "new_device", challengeId: "c1" } })).toEqual({ kind: "new_device", challengeId: "c1" });
    expect(stepFromResponse({ status: 200, body: { next: "set_password", challengeId: "c2" } })).toEqual({ kind: "set_password", challengeId: "c2" });
  });
  it("treats a next step without a challenge as an error", () => {
    expect(stepFromResponse({ status: 200, body: { next: "new_device" } }).kind).toBe("error");
  });
  it("maps a 202 acknowledgement to sent", () => {
    expect(stepFromResponse({ status: 202, body: { ok: true } })).toEqual({ kind: "sent" });
  });
  it("uses the API's message for credential and code errors", () => {
    expect(stepFromResponse({ status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } } }))
      .toEqual({ kind: "error", code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    expect(stepFromResponse({ status: 400, body: { error: { code: "INVALID_CODE", message: "That code is not valid. Request a new one." } } }).kind).toBe("error");
  });
  it("explains the bot check in app terms", () => {
    const step = stepFromResponse({ status: 400, body: { error: { code: "BOT_CHECK_FAILED", message: "Please complete the check and try again." } } });
    expect(step).toMatchObject({ kind: "error", code: "BOT_CHECK_FAILED" });
    expect(step.kind === "error" && step.message).toMatch(/password/i);
  });
  it("falls back to friendly messages without a body", () => {
    expect(stepFromResponse({ status: 0, body: null })).toEqual({ kind: "error", code: "NETWORK", message: NETWORK_ERROR });
    expect(stepFromResponse({ status: 429, body: null })).toMatchObject({ kind: "error", message: expect.stringMatching(/too many/i) });
    expect(stepFromResponse({ status: 404, body: { error: { code: "NOT_FOUND", message: "Not found" } } })).toMatchObject({ kind: "error", message: expect.stringMatching(/not available/i) });
    expect(stepFromResponse({ status: 426, body: null })).toMatchObject({ kind: "error", code: "UPGRADE_REQUIRED" });
  });
  it("rejects a 200 without usable tokens", () => {
    expect(stepFromResponse({ status: 200, body: { accessToken: "a" } }).kind).toBe("error");
  });
});

describe("finishSignIn", () => {
  function deps(meStatus: number, role?: string) {
    return {
      me: jest.fn(async () => ({ status: meStatus, body: role ? { data: { role } } : null })),
      signOutRemote: jest.fn(async () => undefined),
      store: { signIn: jest.fn(async () => undefined) },
    };
  }

  it("stores the session for a normal account", async () => {
    const d = deps(200, "agent");
    await expect(finishSignIn(tokens, d)).resolves.toBe("ok");
    expect(d.me).toHaveBeenCalledWith("a");
    expect(d.store.signIn).toHaveBeenCalledWith(tokens);
    expect(d.signOutRemote).not.toHaveBeenCalled();
  });

  it("revokes and never stores a super admin session", async () => {
    const d = deps(200, "superAdmin");
    await expect(finishSignIn(tokens, d)).resolves.toBe("super_admin");
    expect(d.signOutRemote).toHaveBeenCalledWith("a");
    expect(d.store.signIn).not.toHaveBeenCalled();
  });

  it("still returns super_admin when the revoke call fails", async () => {
    const d = deps(200, "superAdmin");
    d.signOutRemote.mockRejectedValueOnce(new Error("offline"));
    await expect(finishSignIn(tokens, d)).resolves.toBe("super_admin");
  });

  it("stores the session when the profile lookup fails; the app's gate decides later", async () => {
    const d = deps(403);
    await expect(finishSignIn(tokens, d)).resolves.toBe("ok");
    expect(d.store.signIn).toHaveBeenCalled();
  });
});
