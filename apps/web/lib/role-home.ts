// Page access for roles whose whole job is one area (docs/prd-whatsapp-admin-role.md).
// The API enforces permissions; this only keeps such users on the page they can use.

export const WHATSAPP_ADMIN_HOME = "/settings/whatsapp-account";

export function isPathAllowedForRole(role: string | undefined, pathname: string): boolean {
  if (role !== "whatsappAdmin") return true;
  return pathname === WHATSAPP_ADMIN_HOME || pathname.startsWith(WHATSAPP_ADMIN_HOME + "/");
}
