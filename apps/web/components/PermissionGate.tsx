"use client";

import { JSX, ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess, canAccessSub } from "@/lib/can";

/**
 * Page-view guard (Phase 2 / D14). Renders `children` only when the current user
 * holds the required permission; otherwise shows Access Denied. admin/superAdmin
 * bypass. The backend guard is the real boundary — this is UX so a restricted user
 * never lands on a dead page. Wraps both client and server children.
 *
 * - `permission` alone → parent section gate (`canAccess`).
 * - `permission` + `sub` → action gate (`canAccessSub`), e.g. create/edit pages.
 */
export function PermissionGate({
  permission,
  sub,
  children,
}: {
  permission: string;
  sub?: string;
  children: ReactNode;
}): JSX.Element {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;
  }

  const ok = sub ? canAccessSub(user, permission, sub) : canAccess(user, permission);
  if (!ok) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="text-lg font-semibold text-gray-900">Access Denied</p>
        <p className="text-sm text-gray-500">You don’t have permission to view this section.</p>
      </div>
    );
  }

  return <>{children}</>;
}
