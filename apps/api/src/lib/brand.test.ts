import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_BRAND,
  RESERVED_SLUGS,
  isAllowedAssetUrl,
  makePalette,
  resolveBrand,
  validateBrandInput,
  validateSlug,
} from "./brand.js";

const DEFAULT_SCALE = {
  "50": "#f0fdf4",
  "100": "#dcfce7",
  "200": "#bbf7d0",
  "300": "#86efac",
  "400": "#4ade80",
  "500": "#22c55e",
  "600": "#16a34a",
  "700": "#15803d",
  "800": "#166534",
  "900": "#14532d",
};
const KEYS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;

function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("makePalette", () => {
  it("returns the exact current scale for the default green", () => {
    expect(makePalette("#22c55e")).toEqual(DEFAULT_SCALE);
    expect(makePalette("#22C55E")).toEqual(DEFAULT_SCALE);
  });
  it("builds a monotonic 10-shade scale around a custom color", () => {
    const p = makePalette("#3366CC");
    expect(Object.keys(p)).toEqual([...KEYS]);
    for (const k of KEYS) expect(p[k]).toMatch(/^#[0-9a-f]{6}$/);
    expect(p["500"]).toBe("#3366cc");
    const ls = KEYS.map((k) => lightness(p[k]));
    for (let i = 1; i < ls.length; i++) expect(ls[i]!).toBeLessThan(ls[i - 1]!);
  });
  it("throws on invalid hex", () => {
    for (const bad of ["", "22c55e", "#22c55", "#22c55e0", "#gggggg", "red"]) {
      expect(() => makePalette(bad)).toThrow();
    }
  });
});

describe("validateBrandInput", () => {
  const good = { name: "Acme", color: "#AABBCC", supportEmail: "help@acme.com", slug: "acme", hidePoweredBy: true };
  it("accepts and normalizes valid input", () => {
    const r = validateBrandInput(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Acme");
      expect(r.value.color).toBe("#aabbcc");
    }
  });
  it("accepts absent or null email", () => {
    expect(validateBrandInput({ ...good, supportEmail: null }).ok).toBe(true);
    const rest: Record<string, unknown> = { ...good };
    delete rest["supportEmail"];
    expect(validateBrandInput(rest).ok).toBe(true);
  });
  const fails: [string, Record<string, unknown>, string][] = [
    ["1-char name", { name: "A" }, "name"],
    ["whitespace-only name", { name: "   " }, "name"],
    ["41-char name", { name: "a".repeat(41) }, "name"],
    ["markup in name", { name: "<b>Acme</b>" }, "name"],
    ["control char in name", { name: "Ac\u0000me" }, "name"],
    ["bad color", { color: "#12345" }, "color"],
    ["named color", { color: "green" }, "color"],
    ["bad email", { supportEmail: "not-an-email" }, "supportEmail"],
    ["reserved slug", { slug: "admin" }, "slug"],
    ["uppercase slug", { slug: "Acme" }, "slug"],
    ["double hyphen slug", { slug: "ac--me" }, "slug"],
    ["non-boolean hidePoweredBy", { hidePoweredBy: "yes" }, "hidePoweredBy"],
  ];
  it.each(fails)("rejects %s", (_n, patch, field) => {
    const r = validateBrandInput({ ...good, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe(field);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
  it("rejects non-objects", () => {
    expect(validateBrandInput(null).ok).toBe(false);
    expect(validateBrandInput("x").ok).toBe(false);
  });
});

describe("validateSlug", () => {
  it("accepts good slugs", () => {
    for (const s of ["acme", "my-brand", "a1b", "abc-123"]) expect(validateSlug(s)).toBe(true);
  });
  it("rejects bad ones", () => {
    for (const s of ["ab", "a".repeat(41), "-abc", "abc-", "ab--c", "ABC", "a_b", "a b", ""]) {
      expect(validateSlug(s)).toBe(false);
    }
  });
  it("rejects every reserved word", () => {
    for (const s of RESERVED_SLUGS) {
      if (s.length >= 3) expect(validateSlug(s)).toBe(false);
    }
    expect(validateSlug("wbmsg")).toBe(false);
    expect(validateSlug("sign-in")).toBe(false);
  });
});

describe("isAllowedAssetUrl", () => {
  const saved = process.env["R2_PUBLIC_URL"];
  beforeEach(() => {
    process.env["R2_PUBLIC_URL"] = "https://cdn.x.com/a/";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env["R2_PUBLIC_URL"];
    else process.env["R2_PUBLIC_URL"] = saved;
  });
  it("accepts https R2 images", () => {
    expect(isAllowedAssetUrl("https://cdn.x.com/a/org/logo.png")).toBe(true);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/org/logo.JPG")).toBe(true);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x.webp")).toBe(true);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x.ico")).toBe(true);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x.jpeg")).toBe(true);
  });
  it("rejects svg and other extensions", () => {
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x.svg")).toBe(false);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x.html")).toBe(false);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x")).toBe(false);
  });
  it("rejects other hosts, schemes and tricks", () => {
    expect(isAllowedAssetUrl("https://evil.com/a/x.png")).toBe(false);
    expect(isAllowedAssetUrl("http://cdn.x.com/a/x.png")).toBe(false);
    expect(isAllowedAssetUrl("javascript:alert(1)//https://cdn.x.com/a/x.png")).toBe(false);
    expect(isAllowedAssetUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isAllowedAssetUrl("https://cdn.x.com@evil.com/a/x.png")).toBe(false);
    expect(isAllowedAssetUrl("https://cdn.x.com/a/@evil/x.png")).toBe(false);
  });
  it("requires a path boundary", () => {
    expect(isAllowedAssetUrl("https://cdn.x.com/abc/x.png")).toBe(false);
    expect(isAllowedAssetUrl("https://cdn.x.com/a")).toBe(false);
  });
  it("is false when R2_PUBLIC_URL is unset or not https", () => {
    delete process.env["R2_PUBLIC_URL"];
    expect(isAllowedAssetUrl("https://cdn.x.com/a/x.png")).toBe(false);
    process.env["R2_PUBLIC_URL"] = "http://cdn.x.com/a";
    expect(isAllowedAssetUrl("http://cdn.x.com/a/x.png")).toBe(false);
  });
});

describe("resolveBrand", () => {
  type Row = Record<string, unknown>;
  const brandFields = (o: Row = {}): Row => ({
    isParent: false,
    parentOrganizationId: null,
    parentOrganization: null,
    whiteLabelEnabled: false,
    brandName: null,
    brandColor: null,
    brandSupportEmail: null,
    brandHidePoweredBy: false,
    slug: null,
    logoImage: null,
    smallLogoImage: null,
    favicon: null,
    darkLogoImage: null,
    darkSmallLogoImage: null,
    darkFavicon: null,
    ...o,
  });
  const parentRow = brandFields({
    isParent: true,
    whiteLabelEnabled: true,
    brandName: "Acme",
    brandColor: "#3366cc",
    brandSupportEmail: "help@acme.com",
    brandHidePoweredBy: true,
    slug: "acme",
    logoImage: "https://cdn/l.png",
    smallLogoImage: "https://cdn/s.png",
    favicon: "https://cdn/f.ico",
    darkLogoImage: "https://cdn/dl.png",
    darkSmallLogoImage: "https://cdn/ds.png",
    darkFavicon: "https://cdn/df.ico",
  });
  const prismaWith = (row: Row | null) => {
    const findUnique = vi.fn(async () => row);
    return { prisma: { organization: { findUnique } } as unknown as PrismaClient, findUnique };
  };
  const expectedAcme = {
    name: "Acme",
    logoUrl: "https://cdn/l.png",
    smallLogoUrl: "https://cdn/s.png",
    faviconUrl: "https://cdn/f.ico",
    darkLogoUrl: "https://cdn/dl.png",
    darkSmallLogoUrl: "https://cdn/ds.png",
    darkFaviconUrl: "https://cdn/df.ico",
    primaryColor: "#3366cc",
    supportEmail: "help@acme.com",
    hidePoweredBy: true,
    slug: "acme",
    isDefault: false,
  };

  it("DEFAULT_BRAND matches the WBMSG look", () => {
    expect(DEFAULT_BRAND).toMatchObject({
      name: "WBMSG",
      primaryColor: "#22c55e",
      isDefault: true,
      slug: null,
      supportEmail: null,
      hidePoweredBy: false,
    });
  });
  it("returns an enabled parent's own brand with one query", async () => {
    const { prisma, findUnique } = prismaWith(parentRow);
    expect(await resolveBrand(prisma, "p1")).toEqual(expectedAcme);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("returns the parent's brand for its client", async () => {
    const { prisma, findUnique } = prismaWith(
      brandFields({ parentOrganizationId: "p1", parentOrganization: parentRow })
    );
    expect(await resolveBrand(prisma, "c1")).toEqual(expectedAcme);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("falls back to the default color when brandColor is null", async () => {
    const { prisma } = prismaWith({ ...parentRow, brandColor: null });
    expect((await resolveBrand(prisma, "p1")).primaryColor).toBe("#22c55e");
  });
  it("returns DEFAULT_BRAND when white-label is off", async () => {
    const { prisma } = prismaWith({ ...parentRow, whiteLabelEnabled: false });
    expect(await resolveBrand(prisma, "p1")).toEqual(DEFAULT_BRAND);
  });
  it("returns DEFAULT_BRAND when the parent has no brand name", async () => {
    const { prisma } = prismaWith({ ...parentRow, brandName: null });
    expect(await resolveBrand(prisma, "p1")).toEqual(DEFAULT_BRAND);
    const c = prismaWith(
      brandFields({ parentOrganizationId: "p1", parentOrganization: { ...parentRow, brandName: null } })
    );
    expect(await resolveBrand(c.prisma, "c1")).toEqual(DEFAULT_BRAND);
  });
  it("returns DEFAULT_BRAND when the client's parent is no longer a parent", async () => {
    const c = prismaWith(
      brandFields({ parentOrganizationId: "p1", parentOrganization: { ...parentRow, isParent: false } })
    );
    expect(await resolveBrand(c.prisma, "c1")).toEqual(DEFAULT_BRAND);
  });
  it("returns DEFAULT_BRAND when the client's parent has white-label off", async () => {
    const c = prismaWith(
      brandFields({ parentOrganizationId: "p1", parentOrganization: { ...parentRow, whiteLabelEnabled: false } })
    );
    expect(await resolveBrand(c.prisma, "c1")).toEqual(DEFAULT_BRAND);
  });
  it("returns DEFAULT_BRAND for an org with no parent", async () => {
    const { prisma } = prismaWith(brandFields());
    expect(await resolveBrand(prisma, "o1")).toEqual(DEFAULT_BRAND);
  });
  it("returns DEFAULT_BRAND for an unknown org", async () => {
    const { prisma } = prismaWith(null);
    expect(await resolveBrand(prisma, "nope")).toEqual(DEFAULT_BRAND);
  });
  it("never returns ids", async () => {
    const { prisma } = prismaWith({ ...parentRow, id: "p1" });
    expect(Object.keys(await resolveBrand(prisma, "p1")).sort()).toEqual(Object.keys(DEFAULT_BRAND).sort());
    expect(Object.keys(DEFAULT_BRAND).some((k) => /id$/i.test(k))).toBe(false);
  });
});
