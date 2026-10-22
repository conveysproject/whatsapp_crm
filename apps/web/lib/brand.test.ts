import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindConfig from "../tailwind.config";
import { DEFAULT_BRAND, DEFAULT_PALETTE, SHADES, brandCssText, brandMetadata, fetchBrandServer, parseBrand } from "./brand";

// Today's tailwind scale, written out so the test does not depend on the constant under test.
const TODAY = {
  50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80",
  500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d",
};

const custom = {
  name: "Acme Cloud",
  logoUrl: "https://cdn.example.com/brand/logo.png",
  smallLogoUrl: null,
  faviconUrl: "https://cdn.example.com/brand/fav.ico",
  darkLogoUrl: null,
  darkSmallLogoUrl: null,
  darkFaviconUrl: null,
  primaryColor: "#1a2b3c",
  palette: { 50: "#e8eaec", 100: "#d1d5d8", 200: "#a3aab0", 300: "#6a7a85", 400: "#3a4a58", 500: "#1a2b3c", 600: "#17263a", 700: "#142233", 800: "#10202d", 900: "#0c1a24" },
  supportEmail: "help@acme.test",
  hidePoweredBy: true,
  slug: "acme-cloud",
  isDefault: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DEFAULT_BRAND", () => {
  it("is the WBMSG brand with today's exact palette", () => {
    expect(DEFAULT_BRAND).toMatchObject({ name: "WBMSG", logoUrl: null, faviconUrl: null, primaryColor: "#22c55e", hidePoweredBy: false, isDefault: true });
    expect(DEFAULT_BRAND.palette).toEqual(TODAY);
    expect(DEFAULT_PALETTE).toEqual(TODAY);
  });
});

describe("parseBrand", () => {
  it("accepts a well formed brand", () => {
    expect(parseBrand(custom)).toEqual(custom);
  });
  it.each([
    ["null", null],
    ["a string", "x"],
    ["an array", []],
    ["empty object", {}],
    ["non-hex palette value", { ...custom, palette: { ...custom.palette, 500: "red" } }],
    ["palette value with css", { ...custom, palette: { ...custom.palette, 500: "}body{display:none" } }],
    ["uppercase palette value", { ...custom, palette: { ...custom.palette, 500: "#1A2B3C" } }],
    ["missing palette shade", { ...custom, palette: { ...custom.palette, 900: undefined } }],
    ["palette not an object", { ...custom, palette: "#fff" }],
    ["bad primary color", { ...custom, primaryColor: "#12" }],
    ["javascript: logo url", { ...custom, logoUrl: "javascript:alert(1)" }],
    ["http favicon url", { ...custom, faviconUrl: "http://cdn.example.com/f.ico" }],
    ["data: url", { ...custom, darkLogoUrl: "data:image/png;base64,AAAA" }],
    ["url that is a number", { ...custom, logoUrl: 5 }],
    ["name wrong type", { ...custom, name: 42 }],
    ["empty name", { ...custom, name: "  " }],
    ["name with markup", { ...custom, name: "<b>x</b>" }],
    ["hidePoweredBy wrong type", { ...custom, hidePoweredBy: "yes" }],
    ["isDefault wrong type", { ...custom, isDefault: "no" }],
    ["supportEmail wrong type", { ...custom, supportEmail: 3 }],
  ])("falls back to the default for %s", (_n, input) => {
    expect(parseBrand(input)).toBe(DEFAULT_BRAND);
  });
  it("treats a payload flagged isDefault as the default", () => {
    expect(parseBrand({ ...custom, isDefault: true })).toBe(DEFAULT_BRAND);
  });
});

describe("brandCssText", () => {
  it("is null for the default brand", () => {
    expect(brandCssText(DEFAULT_BRAND)).toBeNull();
  });
  it("emits only numeric channel triplets and the two hex variables for a custom brand", () => {
    const css = brandCssText(parseBrand(custom))!;
    expect(css).toMatch(
      /^:root\{(--brand-(50|100|200|300|400|500|600|700|800|900):\d{1,3} \d{1,3} \d{1,3};){10}--color-brand:#[0-9a-f]{6};--color-brand-dark:#[0-9a-f]{6}\}$/,
    );
    expect(css).toContain("--brand-500:26 43 60;");
    expect(css).toContain("--brand-50:232 234 236;");
    expect(css).toContain("--color-brand:#1a2b3c;");
    expect(css).toContain("--color-brand-dark:#142233}");
  });
  it("cannot be used to inject css, even when handed an unparsed hostile brand", () => {
    const hostile = { ...custom, palette: { ...custom.palette, 500: "}body{display:none" } };
    expect(parseBrand(hostile)).toBe(DEFAULT_BRAND);
    expect(brandCssText(parseBrand(hostile))).toBeNull();
    // Even if a caller skips parseBrand, a bad value never reaches the output.
    expect(brandCssText(hostile as never)).toBeNull();
    expect(brandCssText({ ...custom, primaryColor: "red;}x{" } as never)).toBeNull();
  });
});

describe("brandMetadata", () => {
  it("is empty for the default brand so the root metadata stays untouched", () => {
    expect(brandMetadata(DEFAULT_BRAND)).toEqual({});
  });
  it("sets the title template and favicon for a branded org", () => {
    expect(brandMetadata(parseBrand(custom))).toEqual({
      title: { template: "%s | Acme Cloud", default: "Acme Cloud" },
      icons: { icon: "https://cdn.example.com/brand/fav.ico", shortcut: "https://cdn.example.com/brand/fav.ico" },
    });
  });
  it("omits icons when there is no favicon", () => {
    const m = brandMetadata(parseBrand({ ...custom, faviconUrl: null }));
    expect(m).toEqual({ title: { template: "%s | Acme Cloud", default: "Acme Cloud" } });
    expect(m).not.toHaveProperty("icons");
  });
});

describe("fetchBrandServer", () => {
  it("GETs /v1/brand with the given headers, no-store, and parses the data envelope", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: custom }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const brand = await fetchBrandServer({ Authorization: "Bearer t", "X-Impersonate-Token": "i" });
    expect(brand).toEqual(custom);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/brand$/);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ Authorization: "Bearer t", "X-Impersonate-Token": "i" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("returns the default on a 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await fetchBrandServer({})).toBe(DEFAULT_BRAND);
  });
  it("returns the default on invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    expect(await fetchBrandServer({})).toBe(DEFAULT_BRAND);
  });
  it("returns the default on a malformed payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { ...custom, palette: {} } }), { status: 200 })));
    expect(await fetchBrandServer({})).toBe(DEFAULT_BRAND);
  });
  it("returns the default when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await fetchBrandServer({})).toBe(DEFAULT_BRAND);
  });
  it("gives up after the timeout instead of blocking the page", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(new Error("aborted")));
      })),
    );
    const p = fetchBrandServer({});
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe(DEFAULT_BRAND);
  });
});

describe("css variable defaults", () => {
  const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
  const triplet = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

  it("globals.css :root defaults equal today's hex values for every shade", () => {
    for (const shade of SHADES) {
      const m = css.match(new RegExp(`--brand-${shade}:\\s*(\\d+ \\d+ \\d+);`));
      expect(m, `--brand-${shade}`).not.toBeNull();
      expect(m![1]).toBe(triplet(TODAY[shade]));
    }
    expect(css).toMatch(/--color-brand:\s*#22c55e;/);
    expect(css).toMatch(/--color-brand-dark:\s*#15803d;/);
  });
  it("tailwind brand colors read the variables with alpha support", () => {
    const brand = (tailwindConfig.theme!.extend!.colors as Record<string, Record<string, string>>)["brand"]!;
    for (const shade of SHADES) expect(brand[shade]).toBe(`rgb(var(--brand-${shade}) / <alpha-value>)`);
  });
});
