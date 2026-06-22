export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  permissions: Record<string, string>;
}

/** Mirrors apps/api/src/lib/permissions.ts — keep in sync. */
export function canAccess(user: CurrentUser | null | undefined, key: string): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superAdmin") return true;
  const keys = Object.keys(user.permissions);
  if (keys.length === 0) return true; // empty = backwards-compat open access
  return user.permissions[key] === "allow";
}

export function hasSubPermission(user: CurrentUser | null | undefined, parentKey: string, subKey: string): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superAdmin") return true;
  return user.permissions[`${parentKey}@${subKey}`] !== "deny";
}

export function isAdmin(user: CurrentUser | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "superAdmin";
}

export function isManagerOrAbove(user: CurrentUser | null | undefined): boolean {
  return ["admin", "superAdmin", "manager"].includes(user?.role ?? "");
}

/**
 * Checks parent permission AND explicit sub-permission.
 * Both must be "allow". Admin/superAdmin bypass. Empty permissions = open (backwards compat).
 */
export function canAccessSub(
  user: CurrentUser | null | undefined,
  parentKey: string,
  subKey: string
): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superAdmin") return true;
  const keys = Object.keys(user.permissions);
  if (keys.length === 0) return true;
  if (user.permissions[parentKey] !== "allow") return false;
  return user.permissions[`${parentKey}@${subKey}`] === "allow";
}
