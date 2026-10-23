import { DEFAULT_PALETTE, SHADES, type Shade } from "./brand";

// Same algorithm and constants as apps/api/src/lib/brand.ts makePalette (parity test: brand-palette.test.ts).
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = "#22c55e";

// Share of white (light shades) or black (dark shades) mixed into the base color.
const MIX: [Shade, number, number][] = [
  [50, 255, 0.92],
  [100, 255, 0.84],
  [200, 255, 0.68],
  [300, 255, 0.48],
  [400, 255, 0.24],
  [600, 0, 0.12],
  [700, 0, 0.26],
  [800, 0, 0.4],
  [900, 0, 0.52],
];

/** The ten brand shades for a #RRGGBB color (used only for the settings preview), or null when it is not one. */
export function makePaletteClient(hex: string): Record<Shade, string> | null {
  if (typeof hex !== "string" || !HEX_RE.test(hex)) return null;
  const h = hex.toLowerCase();
  if (h === DEFAULT_COLOR) return { ...DEFAULT_PALETTE };
  const n = parseInt(h.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = { 500: h } as Record<Shade, string>;
  for (const [shade, target, ratio] of MIX) {
    const mixed = rgb.map((c) => Math.round(c + (target - c) * ratio));
    out[shade] = "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  return Object.fromEntries(SHADES.map((k) => [k, out[k]])) as Record<Shade, string>;
}
