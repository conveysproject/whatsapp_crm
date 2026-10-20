"use client";

import type { JSX, ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOrganization } from "@/hooks/useOrganization";
import { NOT_AVAILABLE_MESSAGE, showClientsNav } from "@/lib/parent-orgs";

/** UX gate for the Clients pages (parent org + admin). The API enforces the same rules. */
export function ParentGate({ children }: { children: ReactNode }): JSX.Element {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { org, isLoading: orgLoading } = useOrganization();
  if (userLoading || orgLoading) return <div className="py-12 text-center text-sm text-gray-400">Loading...</div>;
  if (!showClientsNav(user, org)) return <NotAvailable />;
  return <>{children}</>;
}

export function NotAvailable({ message = NOT_AVAILABLE_MESSAGE }: { message?: string }): JSX.Element {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}
