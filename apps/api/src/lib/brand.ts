import type { PrismaClient } from "@prisma/client";

export interface Brand {
  name: string;
  logoUrl: string | null;
  smallLogoUrl: string | null;
  faviconUrl: string | null;
  darkLogoUrl: string | null;
  darkSmallLogoUrl: string | null;
  darkFaviconUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  hidePoweredBy: boolean;
  slug: string | null;
  isDefault: boolean;
}

export interface BrandInput {
  name: string;
  color: string;
  supportEmail: string | null;
  slug: string;
  hidePoweredBy: boolean;
}

const DEFAULT_COLOR = "#22c55e";

export const DEFAULT_BRAND: Brand = {
  name: "WBMSG",
  logoUrl: null,
  smallLogoUrl: null,
  faviconUrl: null,
  darkLogoUrl: null,
  darkSmallLogoUrl: null,
  darkFaviconUrl: null,
  primaryColor: DEFAULT_COLOR,
  supportEmail: null,
  hidePoweredBy: false,
  slug: null,
  isDefault: true,
};

export const RESERVED_SLUGS: readonly string[] = [
  "wbmsg", "conveys", "admin", "api", "www", "app", "support", "billing", "login", "signin",
  "sign-in", "signup", "sign-up", "docs", "settings", "c", "static", "assets", "blog", "help",
  "mail", "status", "dashboard", "parent", "invitations", "client-invitations", "auth", "public",
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/**
 * One plain address: the single source of truth for support emails. Identical rules to the web relay's
 * `isPlainEmail` (apps/web/lib/mail-from.ts): no whitespace, no second @, none of , ; < > " ' ( ) [ ] \ :,
 * a dot in the domain, at most 254 characters. An address failing it would make the relay refuse the email.
 */
export const PLAIN_EMAIL_RE = /^(?=.{1,254}$)[^\s@,;<>"'()[\]\\:]+@[^\s@,;<>"'()[\]\\:]+\.[^\s@,;<>"'()[\]\\:]+$/;
const HAS_LETTER_OR_DIGIT_RE = /[\p{L}\p{N}]/u;
// eslint-disable-next-line no-control-regex
const BAD_NAME_RE = /[<>\u0000-\u001f\u007f]/;

export function validateSlug(s: string): boolean {
  return typeof s === "string" && s.length >= 3 && s.length <= 40 && SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s);
}

export function validateBrandInput(
  i: unknown
): { ok: true; value: BrandInput } | { ok: false; field: string; message: string } {
  const fail = (field: string, message: string) => ({ ok: false as const, field, message });
  if (typeof i !== "object" || i === null || Array.isArray(i)) return fail("body", "Brand details are required");
  const o = i as Record<string, unknown>;

  const name = typeof o["name"] === "string" ? o["name"].trim() : "";
  if (name.length < 2 || name.length > 40) return fail("name", "Brand name must be 2 to 40 characters");
  if (BAD_NAME_RE.test(name)) return fail("name", "Brand name cannot contain < > or control characters");
  if (!HAS_LETTER_OR_DIGIT_RE.test(name)) return fail("name", "Brand name must contain at least one letter or number");

  const color = o["color"];
  if (typeof color !== "string" || !HEX_RE.test(color)) return fail("color", "Color must look like #1a2b3c");

  let supportEmail: string | null = null;
  const email = o["supportEmail"];
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || email.length > 254 || !PLAIN_EMAIL_RE.test(email.trim())) {
      return fail("supportEmail", "Enter a plain email address without spaces, commas, quotes, brackets or colons");
    }
    supportEmail = email.trim();
  }

  const slug = o["slug"];
  if (typeof slug !== "string" || !validateSlug(slug)) {
    return fail("slug", "Web address must be 3 to 40 lowercase letters, numbers and single hyphens, and not a reserved word");
  }

  const hide = o["hidePoweredBy"];
  if (typeof hide !== "boolean") return fail("hidePoweredBy", "Hide powered by must be true or false");

  return { ok: true, value: { name, color: color.toLowerCase(), supportEmail, slug, hidePoweredBy: hide } };
}

const ALLOWED_EXT = /\.(png|jpe?g|webp|ico)$/i;

export function isAllowedAssetUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  const base = (process.env["R2_PUBLIC_URL"] ?? "").replace(/\/+$/, "");
  if (!base.startsWith("https://")) return false;
  if (url.includes("@") || url.includes("\\") || url.includes("..")) return false;
  if (!url.startsWith("https://")) return false;
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(base);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.origin !== b.origin) return false;
  const basePath = b.pathname.replace(/\/+$/, "");
  if (!u.pathname.startsWith(basePath + "/")) return false;
  return ALLOWED_EXT.test(u.pathname);
}

type Shade = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";

const DEFAULT_PALETTE: Record<Shade, string> = {
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

// Share of white (light shades) or black (dark shades) mixed into the base color.
const MIX: [Shade, number, number][] = [
  ["50", 255, 0.92],
  ["100", 255, 0.84],
  ["200", 255, 0.68],
  ["300", 255, 0.48],
  ["400", 255, 0.24],
  ["600", 0, 0.12],
  ["700", 0, 0.26],
  ["800", 0, 0.4],
  ["900", 0, 0.52],
];

export function makePalette(hex: string): Record<Shade, string> {
  if (typeof hex !== "string" || !HEX_RE.test(hex)) throw new Error("Invalid hex color");
  const h = hex.toLowerCase();
  if (h === DEFAULT_COLOR) return { ...DEFAULT_PALETTE };
  const n = parseInt(h.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = { "500": h } as Record<Shade, string>;
  for (const [shade, target, ratio] of MIX) {
    const mixed = rgb.map((c) => Math.round(c + (target - c) * ratio));
    out[shade] = "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  const order: Shade[] = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
  return Object.fromEntries(order.map((k) => [k, out[k]])) as Record<Shade, string>;
}

export type BrandPayload = Brand & { palette: Record<Shade, string> };

/** The brand as the API returns it: every brand field plus the ten-shade palette derived from the primary color. */
export function brandPayload(brand: Brand): BrandPayload {
  const primaryColor = brand.primaryColor.trim().toLowerCase();
  return { ...brand, primaryColor, palette: makePalette(primaryColor) };
}

const BRAND_SELECT = {
  isParent: true,
  whiteLabelEnabled: true,
  brandName: true,
  brandColor: true,
  brandSupportEmail: true,
  brandHidePoweredBy: true,
  slug: true,
  logoImage: true,
  smallLogoImage: true,
  favicon: true,
  darkLogoImage: true,
  darkSmallLogoImage: true,
  darkFavicon: true,
} as const;

interface BrandRow {
  whiteLabelEnabled: boolean;
  brandName: string | null;
  brandColor: string | null;
  brandSupportEmail: string | null;
  brandHidePoweredBy: boolean;
  slug: string | null;
  logoImage: string | null;
  smallLogoImage: string | null;
  favicon: string | null;
  darkLogoImage: string | null;
  darkSmallLogoImage: string | null;
  darkFavicon: string | null;
}

function toBrand(o: BrandRow, name: string): Brand {
  return {
    name,
    logoUrl: o.logoImage,
    smallLogoUrl: o.smallLogoImage,
    faviconUrl: o.favicon,
    darkLogoUrl: o.darkLogoImage,
    darkSmallLogoUrl: o.darkSmallLogoImage,
    darkFaviconUrl: o.darkFavicon,
    primaryColor: o.brandColor ?? DEFAULT_COLOR,
    supportEmail: o.brandSupportEmail,
    hidePoweredBy: o.brandHidePoweredBy,
    slug: o.slug,
    isDefault: false,
  };
}

/** The org's own brand if it is an enabled parent, else its parent's, else the WBMSG default. Never returns ids. */
export async function resolveBrand(prisma: PrismaClient, orgId: string): Promise<Brand> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ...BRAND_SELECT, parentOrganization: { select: BRAND_SELECT } },
  });
  if (!org) return DEFAULT_BRAND;
  if (org.isParent && org.whiteLabelEnabled && org.brandName) return toBrand(org, org.brandName);
  const parent = org.parentOrganization;
  if (parent && parent.isParent && parent.whiteLabelEnabled && parent.brandName) return toBrand(parent, parent.brandName);
  return DEFAULT_BRAND;
}

/**
 * The brand payload an invitation preview shows for the inviting org. Never throws: a failed lookup is the
 * default brand, so the preview itself keeps working. Carries no ids.
 */
export async function previewBrandPayload(prisma: PrismaClient, orgId: string): Promise<BrandPayload> {
  try {
    return brandPayload(await resolveBrand(prisma, orgId));
  } catch {
    return brandPayload(DEFAULT_BRAND);
  }
}
