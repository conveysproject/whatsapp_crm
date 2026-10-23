import type { Metadata } from "next";
import { isPlainEmail } from "@/lib/mail-from";

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Shade = (typeof SHADES)[number];

export interface Brand {
  name: string;
  logoUrl: string | null;
  smallLogoUrl: string | null;
  faviconUrl: string | null;
  darkLogoUrl: string | null;
  darkSmallLogoUrl: string | null;
  darkFaviconUrl: string | null;
  primaryColor: string;
  palette: Record<Shade, string>;
  supportEmail: string | null;
  hidePoweredBy: boolean;
  slug: string | null;
  isDefault: boolean;
}

/** Today's tailwind `brand` scale. The :root defaults in globals.css are the same values as RGB channels. */
export const DEFAULT_PALETTE: Record<Shade, string> = {
  50: "#f0fdf4",
  100: "#dcfce7",
  200: "#bbf7d0",
  300: "#86efac",
  400: "#4ade80",
  500: "#22c55e",
  600: "#16a34a",
  700: "#15803d",
  800: "#166534",
  900: "#14532d",
};

export const DEFAULT_BRAND: Brand = {
  name: "WBMSG",
  logoUrl: null,
  smallLogoUrl: null,
  faviconUrl: null,
  darkLogoUrl: null,
  darkSmallLogoUrl: null,
  darkFaviconUrl: null,
  primaryColor: "#22c55e",
  palette: DEFAULT_PALETTE,
  supportEmail: null,
  hidePoweredBy: false,
  slug: null,
  isDefault: true,
};

const HEX_RE = /^#[0-9a-f]{6}$/;
// eslint-disable-next-line no-control-regex
const BAD_NAME_RE = /[<>\u0000-\u001f\u007f]/;
const IMAGE_FIELDS = ["logoUrl", "smallLogoUrl", "faviconUrl", "darkLogoUrl", "darkSmallLogoUrl", "darkFaviconUrl"] as const;

function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

function httpsUrlOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string" || v.length > 2048 || /\s/.test(v)) return undefined;
  try {
    return new URL(v).protocol === "https:" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Validates every field of an API brand payload. Anything malformed gives DEFAULT_BRAND. */
export function parseBrand(input: unknown): Brand {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return DEFAULT_BRAND;
  const o = input as Record<string, unknown>;

  if (typeof o["isDefault"] !== "boolean") return DEFAULT_BRAND;
  if (o["isDefault"]) return DEFAULT_BRAND;

  const name = o["name"];
  if (typeof name !== "string") return DEFAULT_BRAND;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80 || BAD_NAME_RE.test(trimmed)) return DEFAULT_BRAND;

  const urls: Record<(typeof IMAGE_FIELDS)[number], string | null> = {
    logoUrl: null, smallLogoUrl: null, faviconUrl: null, darkLogoUrl: null, darkSmallLogoUrl: null, darkFaviconUrl: null,
  };
  for (const f of IMAGE_FIELDS) {
    const u = httpsUrlOrNull(o[f]);
    if (u === undefined) return DEFAULT_BRAND;
    urls[f] = u;
  }

  if (!isHex(o["primaryColor"])) return DEFAULT_BRAND;
  const rawPalette = o["palette"];
  if (typeof rawPalette !== "object" || rawPalette === null || Array.isArray(rawPalette)) return DEFAULT_BRAND;
  const palette = {} as Record<Shade, string>;
  for (const s of SHADES) {
    const v = (rawPalette as Record<string, unknown>)[String(s)];
    if (!isHex(v)) return DEFAULT_BRAND;
    palette[s] = v;
  }

  // A support email that is not one plain address (or could add mailto: parameters such as ?cc= or &body=) is dropped;
  // the rest of the brand stays valid.
  const rawEmail = o["supportEmail"];
  const email = isPlainEmail(rawEmail) && !/[?&#%/=]/.test(rawEmail) ? rawEmail : null;
  const slug = o["slug"];
  if (slug !== null && (typeof slug !== "string" || slug.length > 40)) return DEFAULT_BRAND;
  if (typeof o["hidePoweredBy"] !== "boolean") return DEFAULT_BRAND;

  return {
    name: trimmed,
    ...urls,
    primaryColor: o["primaryColor"],
    palette,
    supportEmail: email,
    hidePoweredBy: o["hidePoweredBy"],
    slug,
    isDefault: false,
  };
}

function channels(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
}

/**
 * CSS that re-points the brand variables for a branded org, or null for the default brand (the defaults in
 * globals.css already apply). Every value is derived from validated hex strings and written as decimal channels
 * or a fixed-shape hex, so nothing coming from the API can add other CSS.
 */
export function brandCssText(brand: Brand): string | null {
  if (brand.isDefault) return null;
  if (!isHex(brand.primaryColor) || !isHex(brand.palette?.[700])) return null;
  let out = ":root{";
  for (const s of SHADES) {
    const hex = brand.palette[s];
    if (!isHex(hex)) return null;
    out += `--brand-${s}:${channels(hex)};`;
  }
  out += `--color-brand:${brand.primaryColor};--color-brand-dark:${brand.palette[700]}}`;
  return out;
}

// 1x1 transparent PNG: a branded org with no image must not show WBMSG's favicon.
const NEUTRAL_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Metadata a branded dashboard adds on top of the root layout. Next replaces `icons` as a whole when a nested layout
 * sets it (it is not merged). The root declares its manifest link through `icons.other`, so replacing `icons` also
 * removes it (nothing is inherited through `metadata.manifest`, so no `manifest: null` is needed). Every non-default
 * brand therefore gets its own icons and never WBMSG's. `title.template` applies to the pages below the layout.
 */
export function brandMetadata(brand: Brand): Metadata {
  if (brand.isDefault) return {};
  const icon = brand.faviconUrl ?? brand.smallLogoUrl ?? brand.logoUrl ?? NEUTRAL_ICON;
  const apple = brand.smallLogoUrl ?? brand.logoUrl;
  return {
    title: { template: `%s | ${brand.name}`, default: brand.name },
    icons: { icon, shortcut: icon, ...(apple ? { apple } : {}) },
  };
}

/** The sign-in page for a brand: its own /c/<slug>/sign-in when it has a slug, else the normal one. */
export function signInPath(slug: string | null): string {
  return slug ? `/c/${slug}/sign-in` : "/sign-in";
}

/**
 * Complete metadata for a public, branded entry page (sign-in, forgot password). The root layout's metadata is WBMSG's
 * (title template, description, openGraph, twitter, canonical), and Next merges it into every page, so each of those
 * fields is set here: nothing of the root's reaches a branded page. `title.absolute` skips the root `%s | WBMSG` template.
 */
export function brandEntryMetadata(brand: Brand, pageTitle: string): Metadata {
  const title = `${pageTitle} | ${brand.name}`;
  const description = `${pageTitle} to ${brand.name}`;
  return {
    ...brandMetadata(brand),
    title: { absolute: title },
    description,
    alternates: { canonical: null },
    openGraph: { type: "website", siteName: brand.name, title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
    robots: { index: false, follow: false },
  };
}

/**
 * The caller's effective brand, for server components. Uses the same headers as the other dashboard fetches
 * (bearer token, plus the impersonation token), so an impersonating admin gets the impersonated org's brand.
 * Never throws and never waits longer than `timeoutMs`: any failure is the default brand.
 */
export async function fetchBrandServer(headers: Record<string, string>, timeoutMs = 3000): Promise<Brand> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/v1/brand`, { headers, cache: "no-store", signal: controller.signal });
    if (!res.ok) return DEFAULT_BRAND;
    const body = (await res.json()) as { data?: unknown } | null;
    return parseBrand(body?.data);
  } catch {
    return DEFAULT_BRAND;
  } finally {
    clearTimeout(timer);
  }
}
