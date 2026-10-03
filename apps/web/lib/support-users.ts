/** Users in a support picker: admins first (they see the whole org), then by role breadth, active before inactive. */
export interface SupportUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

const ROLE_RANK: Record<string, number> = { admin: 0, manager: 1, agent: 2, viewer: 3 };

export function sortUsersForSupport<T extends SupportUser>(users: readonly T[]): T[] {
  const rank = (r: string): number => ROLE_RANK[r] ?? 99;
  return [...users].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const byRole = rank(a.role) - rank(b.role);
    if (byRole !== 0) return byRole;
    return (a.fullName || a.email).localeCompare(b.fullName || b.email);
  });
}

/** Short hint shown next to the role so support can pick the right user. */
export function roleHint(role: string): string | null {
  if (role === "admin") return "sees everything in the org";
  if (role === "manager") return "sees most data";
  if (role === "agent" || role === "viewer") return "sees only their own chats";
  return null;
}
