jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "3.1.0" } } }));

import { ApiError } from "./api";
import { __resetUpgradeForTests, isUpgradeRequired } from "./app-headers";
import { setSessionRecovery } from "./auth/recovery";
import { contentTypeForMime, uploadMedia } from "./media-upload";

describe("contentTypeForMime", () => {
  it("maps MIME types to WhatsApp content types", () => {
    expect(contentTypeForMime("image/jpeg")).toBe("image");
    expect(contentTypeForMime("video/mp4")).toBe("video");
    expect(contentTypeForMime("audio/ogg")).toBe("audio");
    expect(contentTypeForMime("application/pdf")).toBe("document");
  });
});

describe("uploadMedia", () => {
  it("posts multipart with a fresh bearer token and returns the media id", async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { mediaId: "mid-1", mimeType: "image/jpeg", filename: "a.jpg" } }) });
    globalThis.fetch = fetchFn as unknown as typeof fetch;
    const result = await uploadMedia({ uri: "file:///a.jpg", name: "a.jpg", mimeType: "image/jpeg", getToken: async () => "tok", baseUrl: "https://api.test" });
    expect(result).toEqual({ mediaId: "mid-1", mimeType: "image/jpeg", filename: "a.jpg" });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/media/upload");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers).toMatchObject({ "X-App-Client": "mobile", "X-App-Version": "3.1.0" });
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });
  it("throws ApiError with the API code", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: "NO_FILE", message: "No file uploaded" } }) }) as unknown as typeof fetch;
    await expect(uploadMedia({ uri: "x", name: "x", mimeType: "image/png", getToken: async () => "t", baseUrl: "https://api.test" })).rejects.toMatchObject({ status: 400, code: "NO_FILE" });
    await expect(uploadMedia({ uri: "x", name: "x", mimeType: "image/png", getToken: async () => "t", baseUrl: "https://api.test" })).rejects.toBeInstanceOf(ApiError);
  });
  it("retries once with a forced-refresh token after a 401", async () => {
    const fetchFn = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: { code: "UNAUTHORIZED" } }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ data: { mediaId: "m", mimeType: "image/png", filename: "x" } }) });
    globalThis.fetch = fetchFn as unknown as typeof fetch;
    setSessionRecovery(async () => "fresh");
    try {
      await expect(uploadMedia({ uri: "x", name: "x", mimeType: "image/png", getToken: async () => "stale", baseUrl: "https://api.test" })).resolves.toMatchObject({ mediaId: "m" });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh");
    } finally {
      setSessionRecovery(null);
    }
  });
  it("raises the update screen on 426", async () => {
    __resetUpgradeForTests();
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 426, json: async () => ({ error: { code: "UPGRADE_REQUIRED", message: "Update" } }) }) as unknown as typeof fetch;
    await expect(uploadMedia({ uri: "x", name: "x", mimeType: "image/png", getToken: async () => "t", baseUrl: "https://api.test" })).rejects.toMatchObject({ status: 426 });
    expect(isUpgradeRequired()).toBe(true);
  });
});
