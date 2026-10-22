// Super admin side of white-label approval (docs/prd-white-label-website.md, D2). Approval is bound to the brand
// revision the reviewer saw: the PATCH always carries that revision, and the API refuses it if the brand moved on.
import type { UrlField } from "./brand-settings";

/** `brandReview` in the admin organization details response (parent organizations only). */
export interface BrandReview {
  brandName: string | null;
  brandColor: string | null;
  brandSupportEmail: string | null;
  slug: string | null;
  hidePoweredBy: boolean;
  logoUrl: string | null;
  smallLogoUrl: string | null;
  faviconUrl: string | null;
  darkLogoUrl: string | null;
  darkSmallLogoUrl: string | null;
  darkFaviconUrl: string | null;
  brandRevision: number;
  whiteLabelEnabled: boolean;
}

export const REVIEW_IMAGES: readonly { field: UrlField; label: string; dark: boolean }[] = [
  { field: "logoUrl", label: "Logo", dark: false },
  { field: "smallLogoUrl", label: "Small logo", dark: false },
  { field: "faviconUrl", label: "Favicon", dark: false },
  { field: "darkLogoUrl", label: "Logo (dark mode)", dark: true },
  { field: "darkSmallLogoUrl", label: "Small logo (dark mode)", dark: true },
  { field: "darkFaviconUrl", label: "Favicon (dark mode)", dark: true },
];

export const REVIEW_CHECKLIST: readonly string[] = [
  "The name and logo are the company's own, not another company's or a misleading one.",
  "The web address matches the company name.",
  "The support email is a real address of the company.",
];

export const BRAND_CHANGED_MESSAGE = "The brand changed since you opened this page. Reload and review again.";
const FIELD_LABELS: Record<string, string> = {
  brandName: "brand name",
  brandColor: "primary color",
  slug: "web address",
  brandSupportEmail: "support email",
};

/** Reasons Approve is disabled: every required field must be present (the API checks the same). */
export function approvalBlockers(r: BrandReview): string[] {
  const out: string[] = [];
  if (!r.brandName) out.push("Brand name is missing");
  if (!r.brandColor) out.push("Primary color is missing");
  if (!r.slug) out.push("Web address is missing");
  if (!r.brandSupportEmail) out.push("Support email is missing");
  return out;
}

export class WhiteLabelError extends Error {
  constructor(public status: number, public code: string, message: string, public missing: string[] = []) {
    super(message);
    this.name = "WhiteLabelError";
  }
}

export interface ReviewErrorText { message: string; refetch: boolean }

export function reviewErrorText(err: unknown): ReviewErrorText {
  if (err instanceof WhiteLabelError) {
    switch (err.code) {
      case "BRAND_CHANGED":
        return { message: BRAND_CHANGED_MESSAGE, refetch: true };
      case "BRAND_INCOMPLETE": {
        const names = err.missing.map((m) => FIELD_LABELS[m] ?? "a required field");
        return { message: names.length ? `The brand is not complete yet. Missing: ${names.join(", ")}.` : "The brand is not complete yet.", refetch: true };
      }
      case "NOT_PARENT":
        return { message: "Only a parent organization can be white-labelled.", refetch: true };
      default:
        if (err.status === 403) return { message: "You do not have permission to do this.", refetch: false };
        if (err.status === 404) return { message: "Organization not found.", refetch: false };
    }
  }
  return { message: "Something went wrong. Please try again.", refetch: false };
}

/**
 * Approve (enabled, with the revision the reviewer saw) or revoke. `reviewedRevision` is sent only when enabling.
 * Throws WhiteLabelError with the API's code (and `missing` for BRAND_INCOMPLETE).
 */
export async function setWhiteLabel(
  apiBase: string,
  accessToken: string,
  orgId: string,
  enabled: boolean,
  reviewedRevision?: number,
): Promise<void> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/admin/organizations/${encodeURIComponent(orgId)}/white-label`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(enabled ? { enabled: true, reviewedRevision } : { enabled: false }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; missing?: unknown } } | null;
    const missing = Array.isArray(body?.error?.missing) ? body!.error!.missing.filter((m): m is string => typeof m === "string") : [];
    throw new WhiteLabelError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? `Request failed (${res.status})`, missing);
  }
}
