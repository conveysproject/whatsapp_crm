"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/client";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useHydrated } from "@/hooks/useHydrated";
import { canViewBilling } from "@/lib/billing-page";
import { fetchMessageUsage, formatCount } from "@/lib/message-usage";

/**
 * Top-bar chip: "3,240 messages this month", linking to the billing page. Shown only to people who may see billing
 * (admins and billing-permission holders), and nothing is requested for anyone else. Shares its cache with the dashboard card.
 */
export function UsagePill(): JSX.Element | null {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const allowed = canViewBilling(user);
  const q = useQuery({
    queryKey: ["billing-message-usage"],
    queryFn: ({ signal }) => fetchMessageUsage(getToken, signal),
    enabled: allowed,
    retry: false,
    staleTime: 60_000,
  });
  // The usage query shares its cache with the dashboard card, so the pill waits until hydration is over (React #418).
  const hydrated = useHydrated();
  if (!hydrated || !allowed || !q.data) return null;
  return (
    <Link
      href="/settings/billing"
      data-testid="usage-pill"
      className="hidden sm:flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-green-600" />
      {formatCount(q.data.billable)} messages this month
    </Link>
  );
}
