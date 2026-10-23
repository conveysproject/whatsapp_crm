// Web helpers for the Branding settings page (docs/prd-white-label-website.md). The API is the security boundary
// (parent admin only, validation, size and type checks, approval); everything here shapes requests, pre-checks
// inputs for a faster message, and decides what to show. Pure and unit-testable.
import { DEFAULT_BRAND, SHADES, signInPath, type Brand } from "./brand";
import { makePaletteClient } from "./brand-palette";
import { isPlainEmail } from "./mail-from";
import type { ConfirmState } from "./parent-orgs";

/** The label of the "Hide powered by" option. It names the platform's own credit, taken from the default brand. */
export const HIDE_POWERED_BY_LABEL = `Hide 'Powered by ${DEFAULT_BRAND.name}'`;
export const REAPPROVAL_WARNING =
  "Your brand was switched off until it is approved again because the name, web address or an image changed.";
export const GENERIC_ERROR = "Something went wrong. Please try again.";

export type SlotName = "logo" | "smallLogo" | "favicon" | "darkLogo" | "darkSmallLogo" | "darkFavicon";
export type UrlField = "logoUrl" | "smallLogoUrl" | "faviconUrl" | "darkLogoUrl" | "darkSmallLogoUrl" | "darkFaviconUrl";

export interface SlotDef {
  slot: SlotName;
  label: string;
  hint: string;
  urlField: UrlField;
  dark: boolean;
  favicon: boolean;
  maxBytes: number;
  maxLabel: string;
  accept: string;
}

const LOGO_MAX = 1024 * 1024;
const FAVICON_MAX = 256 * 1024;
const IMG_ACCEPT = "image/png,image/jpeg,image/webp";
const FAVICON_ACCEPT = `${IMG_ACCEPT},image/x-icon,image/vnd.microsoft.icon,.ico`;

function def(slot: SlotName, label: string, hint: string, urlField: UrlField, dark: boolean, favicon: boolean): SlotDef {
  return {
    slot, label, hint, urlField, dark, favicon,
    maxBytes: favicon ? FAVICON_MAX : LOGO_MAX,
    maxLabel: favicon ? "256 KB" : "1 MB",
    accept: favicon ? FAVICON_ACCEPT : IMG_ACCEPT,
  };
}

export const BRAND_SLOTS: readonly SlotDef[] = [
  def("logo", "Logo", "Shown at the top of the app and on your sign-in page", "logoUrl", false, false),
  def("smallLogo", "Small logo", "Used where space is narrow, such as the collapsed menu", "smallLogoUrl", false, false),
  def("favicon", "Favicon", "The icon in the browser tab", "faviconUrl", false, true),
  def("darkLogo", "Logo (dark mode)", "Shown instead of the logo on dark backgrounds", "darkLogoUrl", true, false),
  def("darkSmallLogo", "Small logo (dark mode)", "Shown instead of the small logo on dark backgrounds", "darkSmallLogoUrl", true, false),
  def("darkFavicon", "Favicon (dark mode)", "The browser tab icon in dark mode", "darkFaviconUrl", true, true),
];

/** What GET /v1/organizations/brand returns (the stored brand). */
export interface BrandSettings {
  name: string | null;
  color: string | null;
  supportEmail: string | null;
  slug: string | null;
  hidePoweredBy: boolean;
  whiteLabelEnabled: boolean;
  brandRevision: number;
  logoUrl: string | null;
  smallLogoUrl: string | null;
  faviconUrl: string | null;
  darkLogoUrl: string | null;
  darkSmallLogoUrl: string | null;
  darkFaviconUrl: string | null;
}

export interface BrandFormValues {
  name: string;
  color: string;
  supportEmail: string;
  slug: string;
  hidePoweredBy: boolean;
}
export type FormErrors = Partial<Record<keyof BrandFormValues, string>>;

export function formFromSettings(s: BrandSettings): BrandFormValues {
  return { name: s.name ?? "", color: s.color ?? DEFAULT_BRAND.primaryColor, supportEmail: s.supportEmail ?? "", slug: s.slug ?? "", hidePoweredBy: s.hidePoweredBy };
}

// ── Field validation (mirrors apps/api/src/lib/brand.ts validateBrandInput; the API has the final say) ──
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex
const BAD_NAME_RE = /[<>\u0000-\u001f\u007f]/;

export function validateName(v: string): string | null {
  const name = v.trim();
  if (name.length < 2 || name.length > 40) return "Brand name must be 2 to 40 characters";
  if (BAD_NAME_RE.test(name)) return "Brand name cannot contain < > or control characters";
  if (!/[\p{L}\p{N}]/u.test(name)) return "Brand name must contain at least one letter or number";
  return null;
}
export function validateColor(v: string): string | null {
  return HEX_RE.test(v) ? null : "Color must look like #1a2b3c";
}
export function validateEmail(v: string): string | null {
  const e = v.trim();
  if (e === "") return null;
  return e.length <= 254 && isPlainEmail(e) ? null : "Enter a plain email address without spaces, commas, quotes, brackets or colons";
}
export function validateSlugInput(v: string): string | null {
  return v.length >= 3 && v.length <= 40 && SLUG_RE.test(v)
    ? null
    : "Web address must be 3 to 40 lowercase letters, numbers and single hyphens";
}
export function validateBrandForm(v: BrandFormValues): FormErrors {
  const errs: FormErrors = {};
  const checks: [keyof FormErrors, string | null][] = [
    ["name", validateName(v.name)],
    ["color", validateColor(v.color)],
    ["supportEmail", validateEmail(v.supportEmail)],
    ["slug", validateSlugInput(v.slug)],
  ];
  for (const [k, m] of checks) if (m) errs[k] = m;
  return errs;
}

/** The PUT body. Name and email are trimmed, the color lower-cased; an empty email is null. */
export function toSaveBody(v: BrandFormValues): Record<string, unknown> {
  return { name: v.name.trim(), color: v.color.toLowerCase(), supportEmail: v.supportEmail.trim() || null, slug: v.slug, hidePoweredBy: v.hidePoweredBy };
}

// ── File pre-check (the API re-checks size and the real file type) ──
export interface FileInfo { name: string; type: string; size: number }
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
const ICO_TYPES = ["image/x-icon", "image/vnd.microsoft.icon"];

export function preCheckFile(slot: SlotName, file: FileInfo): string | null {
  const d = BRAND_SLOTS.find((s) => s.slot === slot);
  if (!d) return "Unknown image slot";
  if (file.size <= 0) return "That file is empty";
  const isIco = ICO_TYPES.includes(file.type) || (file.type === "" && /\.ico$/i.test(file.name));
  const okType = IMG_TYPES.includes(file.type) || (d.favicon && isIco);
  if (!okType) return d.favicon ? "Use a PNG, JPEG, WebP or ICO image" : "Use a PNG, JPEG or WebP image";
  if (file.size > d.maxBytes) return `That file is too large. The limit for this image is ${d.maxLabel}.`;
  return null;
}

// ── API calls through the same-origin /api/v1 proxy ──
export class BrandApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) {
    super(message);
    this.name = "BrandApiError";
  }
}

async function readError(res: Response): Promise<BrandApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; field?: string } } | null;
  return new BrandApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? `Request failed (${res.status})`, body?.error?.field);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, init);
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export interface SaveResult { data: BrandSettings; reapprovalRequired: boolean }

export async function fetchBrandSettings(): Promise<BrandSettings> {
  return (await call<{ data: BrandSettings }>("/organizations/brand", { cache: "no-store" })).data;
}
export async function saveBrandSettings(values: BrandFormValues): Promise<SaveResult> {
  return call<SaveResult>("/organizations/brand", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toSaveBody(values)),
  });
}
export async function uploadBrandAsset(slot: SlotName, file: File): Promise<SaveResult> {
  const form = new FormData();
  form.append("file", file);
  return call<SaveResult>(`/organizations/brand/assets/${slot}`, { method: "POST", body: form });
}
export async function removeBrandAsset(slot: SlotName): Promise<SaveResult> {
  return call<SaveResult>(`/organizations/brand/assets/${slot}`, { method: "DELETE" });
}

// ── Error text ──
export interface MappedError { field?: keyof BrandFormValues; message: string }

const FORM_FIELDS: readonly string[] = ["name", "color", "supportEmail", "slug", "hidePoweredBy"];

export function mapBrandError(err: unknown): MappedError {
  if (!(err instanceof BrandApiError)) return { message: GENERIC_ERROR };
  switch (err.code) {
    case "VALIDATION_FAILED":
      return {
        ...(err.field && FORM_FIELDS.includes(err.field) ? { field: err.field as keyof BrandFormValues } : {}),
        message: err.message || "Please check the details and try again.",
      };
    case "SLUG_TAKEN":
      return { field: "slug", message: "That web address is already taken. Choose another one." };
    case "FILE_TOO_LARGE":
      return { message: "That file is too large. Logos can be up to 1 MB and favicons up to 256 KB." };
    case "UNSUPPORTED_TYPE":
      return { message: err.message || "Use a PNG, JPEG or WebP image." };
    case "UPLOADS_UNAVAILABLE":
      return { message: "Uploads are not available right now. Please try again later." };
    case "CONFLICT":
      return { message: "The brand changed while saving. Please try again." };
    default:
      if (err.status === 403) return { message: "You do not have permission to change the brand." };
      if (err.status === 429) return { message: "Too many requests. Please wait a moment and try again." };
      return { message: GENERIC_ERROR };
  }
}

// ── Status and links ──
export type BannerState = "reapproval" | "live" | "pending";
/** The warning shows after a change that switched the brand off; otherwise live or pending. */
export function bannerState(s: BrandSettings, reapprovalRequired: boolean): BannerState {
  if (reapprovalRequired && !s.whiteLabelEnabled) return "reapproval";
  return s.whiteLabelEnabled ? "live" : "pending";
}

/** The address clients sign in at. Relative when the page origin is not known (server render). */
export function clientSignInUrl(origin: string | null, slug: string): string | null {
  if (!slug) return null;
  // Only a slug the API would accept is shown as the address; anything else shows a placeholder.
  return `${origin ?? ""}${signInPath(validateSlugInput(slug) === null ? slug : "<your-address>")}`;
}

/** True while any save, upload or remove is running, so the other controls stay disabled (no out-of-order responses). */
export function isBrandBusy(p: { saving: boolean; slotState: Partial<Record<SlotName, { busy: boolean }>>; removeState: ConfirmState }): boolean {
  return p.saving || p.removeState === "running" || Object.values(p.slotState).some((s) => s?.busy === true);
}

/** Drops the errors of the fields being edited; the other fields keep theirs. */
export function clearFieldErrors(errors: FormErrors, patch: Partial<BrandFormValues>): FormErrors {
  const next = { ...errors };
  for (const k of Object.keys(patch) as (keyof BrandFormValues)[]) delete next[k];
  return next;
}

/** A confirm click: only the "confirming" state may start the action; a repeat click while running changes nothing. */
export function startConfirm(state: ConfirmState): { proceed: boolean; next: ConfirmState } {
  return state === "confirming" ? { proceed: true, next: "running" } : { proceed: false, next: state };
}
/** Where the dialog goes after the action: closed on success, back to "confirming" on failure. */
export function finishConfirm(ok: boolean): ConfirmState {
  return ok ? "idle" : "confirming";
}

export function viewAsClient(s: BrandSettings): { href: string | null; reason: string | null } {
  if (!s.whiteLabelEnabled) return { href: null, reason: "Available once your brand is approved." };
  if (!s.slug) return { href: null, reason: "Save a web address first." };
  return { href: signInPath(s.slug), reason: null };
}

/** The brand the preview shows: the current form values over the stored images. Never touches the real brand. */
export function previewBrand(v: BrandFormValues, s: BrandSettings): Brand {
  const typed = makePaletteClient(v.color);
  const color = typed ? v.color.toLowerCase() : (s.color && makePaletteClient(s.color) ? s.color.toLowerCase() : DEFAULT_BRAND.primaryColor);
  return {
    ...DEFAULT_BRAND,
    name: v.name.trim() || "Your brand",
    logoUrl: s.logoUrl, smallLogoUrl: s.smallLogoUrl, faviconUrl: s.faviconUrl,
    darkLogoUrl: s.darkLogoUrl, darkSmallLogoUrl: s.darkSmallLogoUrl, darkFaviconUrl: s.darkFaviconUrl,
    primaryColor: color,
    palette: makePaletteClient(color) ?? DEFAULT_BRAND.palette,
    supportEmail: v.supportEmail.trim() || null,
    hidePoweredBy: v.hidePoweredBy,
    slug: v.slug || null,
    isDefault: false,
  };
}

/**
 * Inline CSS variables for the preview container only (never :root, never a <style> element). Built from the
 * validated palette as decimal channels, the same shape brandCssText writes for the real app.
 */
export function brandPreviewStyle(brand: Brand): Record<string, string> {
  const style: Record<string, string> = {};
  for (const s of SHADES) {
    const hex = brand.palette[s];
    if (!/^#[0-9a-f]{6}$/.test(hex)) return {};
    style[`--brand-${s}`] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
  }
  style["--color-brand"] = brand.primaryColor;
  style["--color-brand-dark"] = brand.palette[700];
  return style;
}
