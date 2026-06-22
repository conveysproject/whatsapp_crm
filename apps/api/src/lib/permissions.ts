export function maskPhone(phone: string): string {
  return phone.slice(0, 3) + "X".repeat(Math.max(0, phone.length - 3));
}

export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx < 2) return "***@***";
  return email.slice(0, 2) + "***" + email.slice(atIdx);
}

// GAP-S04: admin role bypasses all permission checks.
// For non-admin users: empty permissions object = allow (backwards compat for pre-permission orgs);
// once any key is set, the full tree is enforced.
export function canAccess(
  role: string,
  permissions: Record<string, string>,
  key: string
): boolean {
  if (role === "admin" || role === "superAdmin") return true;
  const keys = Object.keys(permissions);
  if (keys.length === 0) return true; // no permissions configured: open access
  return permissions[key] === "allow";
}

// GAP-S58: parent permissions require explicit "allow"; absent = deny
export function hasPermission(permissions: Record<string, string>, key: string): boolean {
  return permissions[key] === "allow";
}

// GAP-S58: sub-permissions (format: "parent@sub") default to allow; explicit "deny" blocks
export function hasSubPermission(permissions: Record<string, string>, parentKey: string, subKey: string): boolean {
  const subValue = permissions[`${parentKey}@${subKey}`];
  return subValue !== "deny";
}

// GAP-S59: hide_contact_* permissions use inverted semantics — "allow" means HIDE
export function shouldHideField(permissions: Record<string, string>, key: "hide_contact_phone_numbers" | "hide_contact_emails"): boolean {
  return permissions[key] === "allow";
}

// Checks parent permission AND explicit sub-permission (both must be "allow")
// Backwards-compat: empty permissions object = open access
export function canAccessSub(
  role: string,
  permissions: Record<string, string>,
  parentKey: string,
  subKey: string
): boolean {
  if (role === "admin" || role === "superAdmin") return true;
  const keys = Object.keys(permissions);
  if (keys.length === 0) return true;
  if (permissions[parentKey] !== "allow") return false;
  return permissions[`${parentKey}@${subKey}`] === "allow";
}
