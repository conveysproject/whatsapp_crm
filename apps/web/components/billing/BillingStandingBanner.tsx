"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canViewBilling } from "@/lib/billing-page";
import { API_BASE } from "@/lib/message-usage";
import { bannerFor, normalizeStanding, OK, type Standing } from "@/lib/billing-standing";

/**
 * Banner shown on every page to everyone in an organization whose WBMSG statement is overdue: a warning with the date
 * sending will pause, and a clear message once sending is actually paused. Renders nothing otherwise, and nothing on error.
 */
export function BillingStandingBanner(): JSX.Element | null {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const q = useQuery<Standing>({
    queryKey: ["billing-standing"],
    queryFn: async ({ signal }) => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/v1/billing/standing`, { headers: { Authorization: `Bearer ${token ?? ""}` }, signal });
        if (!res.ok) return OK;
        return normalizeStanding(((await res.json()) as { data?: unknown }).data);
      } catch {
        return OK;
      }
    },
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const canPay = canViewBilling(user);
  const banner = q.data ? bannerFor(q.data, canPay) : null;
  if (!banner) return null;
  const palette = banner.tone === "danger"
    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100";
  return (
    <div role="alert" data-testid="billing-standing-banner" className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-2.5 text-sm ${palette}`}>
      <span>{banner.message}</span>
      {canPay && (
        <Link href="/settings/billing" className="font-semibold underline underline-offset-2">Open Billing</Link>
      )}
    </div>
  );
}
