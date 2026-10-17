// Which platform roles a user may hand out (invite or role change). Rule: never higher
// than your own. Only admins may create admins or WhatsApp Admins; everyone else who
// can manage members (settings_agents) is limited to manager/agent/viewer.
// superAdmin is never grantable from inside an org. See docs/prd-whatsapp-admin-role.md.

const ADMIN_GRANTABLE = ["admin", "manager", "agent", "viewer", "whatsappAdmin"] as const;
const MEMBER_GRANTABLE = ["manager", "agent", "viewer"] as const;

export function grantableRoles(actorRole: string): readonly string[] {
  return actorRole === "admin" || actorRole === "superAdmin" ? ADMIN_GRANTABLE : MEMBER_GRANTABLE;
}

/**
 * True when `actorRole` may set a user to `newRole`. For role changes pass the target's
 * `currentRole` as well: you may not change someone who holds a role you couldn't grant.
 */
export function canGrantRole(actorRole: string, newRole: string, currentRole?: string): boolean {
  const allowed = grantableRoles(actorRole);
  if (!allowed.includes(newRole)) return false;
  return currentRole === undefined || allowed.includes(currentRole);
}
