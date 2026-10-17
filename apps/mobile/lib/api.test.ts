jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "3.1.0" } } }));

import { ApiError, createApi } from "./api";
import { __resetUpgradeForTests, isUpgradeRequired } from "./app-headers";

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("createApi", () => {
  it("calls getToken on every request and sends it as a Bearer token under /v1", async () => {
    const fetchFn = mockFetch(200, { data: { ok: true } });
    const getToken = jest.fn().mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
    const api = createApi(getToken, "https://api.test");
    await api("/users/me");
    await api("/users/me");
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.test/v1/users/me");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer t1");
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe("Bearer t2");
    expect(fetchFn.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
  });

  it("sends JSON with Content-Type only when there is a body (also for DELETE)", async () => {
    const fetchFn = mockFetch(204, undefined);
    const api = createApi(async () => "t", "https://api.test");
    const result = await api("/users/device-token", { method: "DELETE", body: { token: "x" } });
    expect(result).toBeUndefined();
    const init = fetchFn.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ token: "x" }));
  });

  it("omits Authorization when there is no token", async () => {
    const fetchFn = mockFetch(200, {});
    await createApi(async () => null, "https://api.test")("/health");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("throws ApiError with the API's error code and message", async () => {
    mockFetch(404, { error: { code: "USER_NOT_FOUND", message: "User not found" } });
    const api = createApi(async () => "t", "https://api.test");
    await expect(api("/users/me")).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND", message: "User not found" });
    await expect(api("/users/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError with a generic message when the error body is not JSON", async () => {
    mockFetch(502, undefined);
    await expect(createApi(async () => "t", "https://api.test")("/x")).rejects.toMatchObject({ status: 502, code: "HTTP_ERROR" });
  });

  it("identifies the app on every call", async () => {
    const fetchFn = mockFetch(200, {});
    await createApi(async () => "t", "https://api.test")("/users/me");
    expect(fetchFn.mock.calls[0][1].headers).toMatchObject({ "X-App-Client": "mobile", "X-App-Version": "3.1.0" });
  });

  it("raises the update screen on 426 UPGRADE_REQUIRED", async () => {
    __resetUpgradeForTests();
    mockFetch(426, { error: { code: "UPGRADE_REQUIRED", message: "Please update the WBMSG app to continue." } });
    await expect(createApi(async () => "t", "https://api.test")("/users/me")).rejects.toMatchObject({ status: 426, code: "UPGRADE_REQUIRED" });
    expect(isUpgradeRequired()).toBe(true);
  });
});
