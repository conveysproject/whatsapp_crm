import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PALETTE } from "@/lib/brand";
import { clearPublicBrandCache, fetchPublicBrand, setPublicBrandClock } from "./public-brand";

const payload = (slug: string, name = "Acme Cloud") => ({
  name, logoUrl: null, smallLogoUrl: null, faviconUrl: null, darkLogoUrl: null, darkSmallLogoUrl: null, darkFaviconUrl: null,
  primaryColor: "#0055ff", palette: DEFAULT_PALETTE, supportEmail: null, hidePoweredBy: false, slug, isDefault: false,
});
const ok = (slug: string) => new Response(JSON.stringify({ data: payload(slug) }), { status: 200 });
const fetchMock = vi.fn();
let now = 0;

beforeEach(() => {
  clearPublicBrandCache();
  now = 1_000_000;
  setPublicBrandClock(() => now);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env["PUBLIC_BRAND_SERVER_KEY"];
});
afterEach(() => {
  setPublicBrandClock(null);
  vi.unstubAllGlobals();
  delete process.env["PUBLIC_BRAND_SERVER_KEY"];
});

describe("fetchPublicBrand cache", () => {
  it("serves a hit from memory within 60 s", async () => {
    fetchMock.mockImplementation(async () => ok("acme"));
    const a = await fetchPublicBrand("acme");
    now += 59_000;
    const b = await fetchPublicBrand("acme");
    expect(a?.name).toBe("Acme Cloud");
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after the TTL a 404 replaces the positive entry (revocation takes effect)", async () => {
    fetchMock.mockImplementationOnce(async () => ok("acme"));
    expect(await fetchPublicBrand("acme")).not.toBeNull();
    now += 60_001;
    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 404 }));
    expect(await fetchPublicBrand("acme")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches misses and failures for 60 s too", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    expect(await fetchPublicBrand("nope")).toBeNull();
    expect(await fetchPublicBrand("nope")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockRejectedValue(new Error("down"));
    expect(await fetchPublicBrand("boom")).toBeNull();
    expect(await fetchPublicBrand("boom")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 60_001;
    fetchMock.mockImplementation(async () => new Response("{}", { status: 429 }));
    expect(await fetchPublicBrand("boom")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never throws, for any failure or an invalid slug (which is not even fetched)", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>", { status: 200 }));
    await expect(fetchPublicBrand("garbage")).resolves.toBeNull();
    fetchMock.mockReset();
    await expect(fetchPublicBrand("A_B")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holds at most 500 slugs, evicting the oldest", async () => {
    fetchMock.mockImplementation(async (url: string) => ok(url.split("/").pop()!));
    for (let i = 0; i < 500; i++) await fetchPublicBrand(`slug-${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(500);
    await fetchPublicBrand("slug-500"); // evicts slug-0
    expect(fetchMock).toHaveBeenCalledTimes(501);
    await fetchPublicBrand("slug-499"); // still cached
    expect(fetchMock).toHaveBeenCalledTimes(501);
    await fetchPublicBrand("slug-0"); // was evicted: fetched again
    expect(fetchMock).toHaveBeenCalledTimes(502);
  });
});

describe("fetchPublicBrand request", () => {
  it("is no-store and sends the server key header only when PUBLIC_BRAND_SERVER_KEY is set", async () => {
    fetchMock.mockImplementation(async () => ok("acme"));
    await fetchPublicBrand("acme");
    const first = fetchMock.mock.calls[0]![1] as { cache: string; headers: Record<string, string> };
    expect(first.cache).toBe("no-store");
    expect(first.headers).toEqual({});

    process.env["PUBLIC_BRAND_SERVER_KEY"] = "test-key-test-key-test-key-test-key-1";
    await fetchPublicBrand("other-brand");
    const second = fetchMock.mock.calls[1]![1] as { headers: Record<string, string> };
    expect(second.headers).toEqual({ "x-brand-server-key": "test-key-test-key-test-key-test-key-1" });
  });
});
