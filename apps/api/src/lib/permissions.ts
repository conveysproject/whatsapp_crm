export function maskPhone(phone: string): string {
  return phone.slice(0, 3) + "X".repeat(Math.max(0, phone.length - 3));
}

export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx < 2) return "***@***";
  return email.slice(0, 2) + "***" + email.slice(atIdx);
}

// admin/superAdmin bypass all checks. Everyone else is deny-by-default: the
// parent key must be explicitly "allow". The auth layer guarantees every
// non-admin role resolves to its DEFAULT_ROLE_PERMISSIONS baseline (or an
// explicit stored config), so an unconfigured org no longer grants blanket access.
export function canAccess(
  role: string,
  permissions: Record<string, string>,
  key: string
): boolean {
  if (role === "admin" || role === "superAdmin") return true;
  return permissions[key] === "allow";
}

// Returns true when phone should be masked — either toggle being set triggers masking.
export function shouldHidePhone(permissions: Record<string, string>): boolean {
  return (
    permissions["hide_phone_number@hide_phone_only"] === "allow" ||
    permissions["hide_phone_number@hide_contact_fields"] === "allow"
  );
}

// Inverted semantics: "allow" means HIDE. Covers phone + email.
// Phone masking: use shouldHidePhone() which is a union of both keys.
// Email masking: only this key triggers email masking.
export function shouldHideContactFields(permissions: Record<string, string>): boolean {
  return permissions["hide_phone_number@hide_contact_fields"] === "allow";
}

// Parent must be "allow" AND the explicit sub-permission must be "allow".
// admin/superAdmin bypass. Deny-by-default for everyone else.
export function canAccessSub(
  role: string,
  permissions: Record<string, string>,
  parentKey: string,
  subKey: string
): boolean {
  if (role === "admin" || role === "superAdmin") return true;
  if (permissions[parentKey] !== "allow") return false;
  return permissions[`${parentKey}@${subKey}`] === "allow";
}
