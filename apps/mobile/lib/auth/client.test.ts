jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "2.0.0" } } }));

import { __resetUpgradeForTests, isUpgradeRequired } from "../app-headers";
import { createAuthClient } from "./client";

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({ status, ok: status < 300, json: () => (body === undefined ? Promise.reject(new Error("x")) : Promise.resolve(body)) });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => __resetUpgradeForTests());

describe("auth client", () => {
  it("signs in as the mobile client with app headers and the stored device id", async () => {
    const fetchFn = mockFetch(200, { next: "new_device", challengeId: "c" });
    const r = await createAuthClient("https://api.test").signInPassword(" a@b.co ", "pw", "dev_1");
    expect(r).toEqual({ status: 200, body: { next: "new_device", challengeId: "c" } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.test/v1/auth/signin/password");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-App-Client": "mobile", "X-App-Version": "2.0.0", "Content-Type": "application/json" });
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.co", password: "pw", client: "mobile", deviceId: "dev_1" });
  });

  it("omits the device id when there is none", async () => {
    const fetchFn = mockFetch(401, { error: { code: "INVALID_CREDENTIALS" } });
    await createAuthClient("https://api.test").signInPassword("a@b.co", "pw", null);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ email: "a@b.co", password: "pw", client: "mobile" });
  });

  it("sends client mobile on code verify, new-device and reset", async () => {
    const fetchFn = mockFetch(200, {});
    const c = createAuthClient("https://api.test");
    await c.verifyEmailCode("a@b.co", " 123456 ");
    await c.verifyNewDevice("ch", "123456");
    await c.resetPassword("a@b.co", "123456", "new password");
    expect(fetchFn.mock.calls.map((call) => [call[0], JSON.parse(call[1].body)])).toEqual([
      ["https://api.test/v1/auth/signin/code/verify", { email: "a@b.co", code: "123456", client: "mobile" }],
      ["https://api.test/v1/auth/signin/new-device", { challengeId: "ch", code: "123456", client: "mobile" }],
      ["https://api.test/v1/auth/password/reset", { email: "a@b.co", code: "123456", newPassword: "new password", client: "mobile" }],
    ]);
  });

  it("signs out and reads the profile with a Bearer token", async () => {
    const fetchFn = mockFetch(200, { ok: true });
    const c = createAuthClient("https://api.test");
    await c.signOut("acc");
    await c.me("acc");
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.test/v1/auth/signout");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer acc");
    expect(fetchFn.mock.calls[0][1].body).toBeUndefined();
    expect(fetchFn.mock.calls[1][0]).toBe("https://api.test/v1/users/me");
    expect(fetchFn.mock.calls[1][1].method).toBe("GET");
  });

  it("maps refresh answers: tokens, 401 = signed out, anything else throws", async () => {
    const c = createAuthClient("https://api.test");
    mockFetch(200, { accessToken: "a2", refreshToken: "r2", expiresIn: 600 });
    await expect(c.refresh("r1")).resolves.toEqual({ ok: true, accessToken: "a2", refreshToken: "r2", expiresIn: 600 });
    mockFetch(401, { error: { code: "SESSION_EXPIRED" } });
    await expect(c.refresh("r1")).resolves.toEqual({ ok: false });
    mockFetch(503, { error: { code: "UNAVAILABLE" } });
    await expect(c.refresh("r1")).rejects.toThrow("503");
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as unknown as typeof fetch;
    await expect(c.refresh("r1")).rejects.toThrow();
  });

  it("requests sign-in and reset codes with only the email", async () => {
    const fetchFn = mockFetch(202, { ok: true });
    const c = createAuthClient("https://api.test");
    await c.requestEmailCode(" a@b.co");
    await c.forgotPassword("a@b.co ");
    expect(fetchFn.mock.calls.map((call) => [call[0], JSON.parse(call[1].body)])).toEqual([
      ["https://api.test/v1/auth/signin/code/request", { email: "a@b.co" }],
      ["https://api.test/v1/auth/password/forgot", { email: "a@b.co" }],
    ]);
  });

  it("turns a network failure into status 0", async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError("offline")) as unknown as typeof fetch;
    await expect(createAuthClient("https://api.test").requestEmailCode("a@b.co")).resolves.toEqual({ status: 0, body: null });
  });

  it("raises the update screen on 426", async () => {
    mockFetch(426, { error: { code: "UPGRADE_REQUIRED" } });
    await createAuthClient("https://api.test").me("acc");
    expect(isUpgradeRequired()).toBe(true);
  });

  it("probes the public key endpoint", async () => {
    const fetchFn = mockFetch(404, { error: { code: "NOT_FOUND" } });
    await expect(createAuthClient("https://api.test").probe()).resolves.toEqual({ status: 404, body: { error: { code: "NOT_FOUND" } } });
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.test/v1/auth/.well-known/jwks.json");
  });

  it("times out a hung request as a network error, so a hung refresh throws (user stays signed in)", async () => {
    jest.useFakeTimers();
    try {
      globalThis.fetch = jest.fn((_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
      ) as unknown as typeof fetch;
      const c = createAuthClient("https://api.test", 15_000);
      const pending = c.refresh("r1");
      const assertion = expect(pending).rejects.toThrow("Network request failed");
      jest.advanceTimersByTime(15_000);
      await assertion;
      const me = c.me("acc");
      jest.advanceTimersByTime(15_000);
      await expect(me).resolves.toEqual({ status: 0, body: null });
    } finally {
      jest.useRealTimers();
    }
  });
});
