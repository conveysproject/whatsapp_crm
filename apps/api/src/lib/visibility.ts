export type VisibilityAuth = {
  userId: string;
  role: string;
  teamId: string | null;
  teamRole: "lead" | "member" | null;
  teamViewAll: boolean;
};

// Returns a Prisma `where` fragment to AND into the query, or `undefined`
// when the caller may see every contact/conversation in the org.
// `field` is the assignee column: "assignedUserId" (contacts) or "assignedTo" (conversations).
export function buildVisibilityWhere(
  auth: VisibilityAuth,
  teamMemberIds: string[],
  field: "assignedUserId" | "assignedTo",
): Record<string, unknown> | undefined {
  // 1. Org-wide roles see everything.
  if (auth.role === "superAdmin" || auth.role === "admin" || auth.role === "viewer") return undefined;
  // 2. A team with "view all contacts" on lifts the restriction for its members.
  if (auth.teamId && auth.teamViewAll) return undefined;
  // 3. Team lead: own + unassigned + every team member's records.
  if (auth.teamRole === "lead") {
    const ids = teamMemberIds.length > 0 ? teamMemberIds : [auth.userId];
    return { OR: [{ [field]: null }, { [field]: { in: ids } }] };
  }
  // 4. Global manager with no team: own + unassigned.
  if (auth.role === "manager" && !auth.teamId) {
    return { OR: [{ [field]: null }, { [field]: auth.userId }] };
  }
  // 5. Everyone else (agents, members): own only.
  return { [field]: auth.userId };
}
