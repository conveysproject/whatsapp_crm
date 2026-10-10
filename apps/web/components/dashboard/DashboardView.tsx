"use client";

import { useCallback, useMemo, type JSX, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";
import { DashboardError, fetchDashboard, type DashRange } from "@/lib/dashboard";
import { ConversationChart } from "@/components/analytics/ConversationChart";
import { MyWorkSection } from "@/components/analytics/MyWorkSection";
import { ActivityFeed } from "@/components/analytics/ActivityFeed";
import { AttentionList, DisconnectedBanner } from "./AttentionList";
import { CampaignFunnel } from "./CampaignFunnel";
import { DashboardErrorState, DashboardNoAccess, DashboardSkeleton } from "./DashboardStates";
import { KpiGrid } from "./KpiGrid";
import { RangePicker } from "./RangePicker";

const RANGES: readonly DashRange[] = ["today", "7d", "30d"];
const CHART_DAYS: Record<DashRange, number> = { today: 7, "7d": 7, "30d": 30 };

export function parseRangeParam(v: string | null | undefined): DashRange {
  return RANGES.find((r) => r === v) ?? "7d";
}

export interface DashboardBodyProps {
  getToken: () => Promise<string | null>;
  range: DashRange;
  onRangeChange: (r: DashRange) => void;
  /** Legacy widgets that authenticate through Clerk themselves; injected so the body is testable. */
  slots?: {
    myWork?: ReactNode;
    volumeChart?: (days: number) => ReactNode;
    activity?: ReactNode;
  };
}

export function DashboardBody({ getToken, range, onRangeChange, slots }: DashboardBodyProps): JSX.Element {
  const { user, isLoading: userLoading, isError: userError, refetch: refetchUser } = useCurrentUser();
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const orgAllowed = canAccess(user, "analytics_access");

  const q = useQuery({
    queryKey: ["dashboard", range, tz],
    queryFn: ({ signal }) => fetchDashboard(getToken, range, tz, signal),
    enabled: orgAllowed,
    retry: false,
  });

  let org: JSX.Element;
  if (userLoading || (orgAllowed && q.isPending)) {
    org = <DashboardSkeleton />;
  } else if (userError && !user) {
    // Could not determine permissions: a retryable error, not a permission denial.
    org = <DashboardErrorState onRetry={refetchUser} />;
  } else if (!orgAllowed || (q.error instanceof DashboardError && q.error.status === 403)) {
    org = <DashboardNoAccess />;
  } else if (q.isError || !q.data) {
    org = <DashboardErrorState onRetry={() => { void q.refetch(); }} />;
  } else {
    const d = q.data;
    org = (
      <div className="space-y-6">
        <DisconnectedBanner items={d.attention} />
        <AttentionList items={d.attention} />
        <KpiGrid kpis={d.kpis} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CampaignFunnel funnel={d.campaignFunnel} />
          {slots?.volumeChart?.(CHART_DAYS[range])}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <RangePicker value={range} onChange={onRangeChange} />
      </div>
      {org}
      {slots?.myWork && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">My Work</h2>
          {slots.myWork}
        </section>
      )}
      {orgAllowed && slots?.activity}
    </div>
  );
}

/** Client entry: range lives in the URL (?range=), auth and legacy widgets come from Clerk. */
export function DashboardView(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = parseRangeParam(params.get("range"));

  const onRangeChange = useCallback(
    (r: DashRange) => {
      const next = new URLSearchParams(params.toString());
      next.set("range", r);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <DashboardBody
      getToken={getToken}
      range={range}
      onRangeChange={onRangeChange}
      slots={{
        myWork: <MyWorkSection />,
        volumeChart: (days) => <ConversationChart days={days} />,
        activity: <ActivityFeed limit={5} />,
      }}
    />
  );
}
