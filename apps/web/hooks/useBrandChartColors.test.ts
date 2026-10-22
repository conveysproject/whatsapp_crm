import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { DEFAULT_BRAND, type Brand } from "@/lib/brand";
import { useBrandChartColors, type BrandChartColors } from "./useBrandChartColors";

const HEX = /^#[0-9a-f]{6}$/;

function Probe(): ReturnType<typeof h> {
  return h("span", null, JSON.stringify(useBrandChartColors()));
}

function colors(brand?: Brand): BrandChartColors {
  const el = brand ? h(BrandProvider, { brand }, h(Probe)) : h(Probe);
  const html = renderToStaticMarkup(el).replace(/^<span>|<\/span>$/g, "").replace(/&quot;/g, '"');
  return JSON.parse(html) as BrandChartColors;
}

describe("useBrandChartColors", () => {
  it("returns exactly today's hex when there is no provider", () => {
    expect(colors()).toEqual({ primary: "#22c55e", primaryDark: "#16a34a", primaryLight: "#4ade80", primarySoft: "#86efac" });
  });

  it("returns the same hex for the default brand provider", () => {
    expect(colors(DEFAULT_BRAND)).toEqual({ primary: "#22c55e", primaryDark: "#16a34a", primaryLight: "#4ade80", primarySoft: "#86efac" });
  });

  it("follows the palette of a branded provider (500/600/400/300)", () => {
    const palette = { ...DEFAULT_BRAND.palette, 300: "#111111", 400: "#222222", 500: "#333333", 600: "#444444" };
    const c = colors({ ...DEFAULT_BRAND, isDefault: false, palette });
    expect(c).toEqual({ primary: "#333333", primaryDark: "#444444", primaryLight: "#222222", primarySoft: "#111111" });
  });

  it("only returns #rrggbb values", () => {
    for (const v of Object.values(colors())) expect(v).toMatch(HEX);
  });
});
