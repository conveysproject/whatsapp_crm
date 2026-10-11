/** Validation and normalisation for the editable business-profile fields of an organization. */

export const PROFILE_FIELDS = ["phone", "website", "location", "industry", "subCategory"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const PROFILE_MAX_LENGTH: Record<ProfileField, number> = {
  phone: 20,
  website: 255,
  location: 255,
  industry: 100,
  subCategory: 100,
};

const PHONE_RE = /^[+0-9 ()-]{5,20}$/;

export type ProfileResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/** Trims; empty becomes null. Website must be http(s) (a bare domain gets https://). */
export function normalizeProfileField(field: ProfileField, raw: string | null): ProfileResult {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, value: null };
  if (v.length > PROFILE_MAX_LENGTH[field]) return { ok: false, message: `${field} is too long` };
  if (field === "phone") {
    return PHONE_RE.test(v) ? { ok: true, value: v } : { ok: false, message: "phone must contain only digits, spaces, + ( ) -" };
  }
  if (field === "website") {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".")) throw new Error("bad");
      return { ok: true, value: withScheme };
    } catch {
      return { ok: false, message: "website must be a valid http(s) address" };
    }
  }
  return { ok: true, value: v };
}
