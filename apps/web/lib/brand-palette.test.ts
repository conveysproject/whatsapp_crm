import { describe, it, expect } from "vitest";
import { makePaletteClient } from "./brand-palette";

// Literal outputs of apps/api/src/lib/brand.ts makePalette, captured by running that function once.
const API_PALETTES: Record<string, Record<string, string>> = {
  "#22c55e": { "50": "#f0fdf4", "100": "#dcfce7", "200": "#bbf7d0", "300": "#86efac", "400": "#4ade80", "500": "#22c55e", "600": "#16a34a", "700": "#15803d", "800": "#166534", "900": "#14532d" },
  "#3366cc": { "50": "#eff3fb", "100": "#dee7f7", "200": "#beceef", "300": "#95afe4", "400": "#648bd8", "500": "#3366cc", "600": "#2d5ab4", "700": "#264b97", "800": "#1f3d7a", "900": "#183162" },
  "#000000": { "50": "#ebebeb", "100": "#d6d6d6", "200": "#adadad", "300": "#7a7a7a", "400": "#3d3d3d", "500": "#000000", "600": "#000000", "700": "#000000", "800": "#000000", "900": "#000000" },
  "#ffffff": { "50": "#ffffff", "100": "#ffffff", "200": "#ffffff", "300": "#ffffff", "400": "#ffffff", "500": "#ffffff", "600": "#e0e0e0", "700": "#bdbdbd", "800": "#999999", "900": "#7a7a7a" },
  "#e11d48": { "50": "#fdedf0", "100": "#fadbe2", "200": "#f5b7c4", "300": "#ef89a0", "400": "#e85374", "500": "#e11d48", "600": "#c61a3f", "700": "#a71535", "800": "#87112b", "900": "#6c0e23" },
};

describe("makePaletteClient parity with the API makePalette", () => {
  for (const [hex, expected] of Object.entries(API_PALETTES)) {
    it(`matches the API for ${hex}`, () => {
      expect({ ...makePaletteClient(hex) }).toEqual(expected);
    });
  }
  it("is case-insensitive like the API", () => {
    expect(makePaletteClient("#E11D48")).toEqual(API_PALETTES["#e11d48"]);
  });
  it("returns null for anything that is not #RRGGBB", () => {
    for (const bad of ["", "red", "#abc", "#12345g", "#1234567", "22c55e"]) expect(makePaletteClient(bad)).toBeNull();
  });
});
