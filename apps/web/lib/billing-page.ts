import { canAccessSub, type CurrentUser } from "./can";

export function canViewBilling(user: CurrentUser | null): boolean {
  return canAccessSub(user, "settings_access", "settings_billing");
}
