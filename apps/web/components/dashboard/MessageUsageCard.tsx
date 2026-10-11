"use client";

import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMessageUsage } from "@/lib/message-usage";
import { MessageUsagePanel } from "@/components/billing/MessageUsagePanel";
import { HeadsUpCard } from "./HeadsUpCard";

/** Dashboard card for admins and billing-permission holders. Renders nothing while loading. */
export function MessageUsageCard({ getToken }: { getToken: () => Promise<string | null> }): JSX.Element | null {
  const q = useQuery({
    queryKey: ["billing-message-usage"],
    queryFn: ({ signal }) => fetchMessageUsage(getToken, signal),
    retry: false,
    staleTime: 60_000,
  });
  if (q.isPending) return null;
  const usage = q.data ?? null;
  return (
    <div className="flex flex-wrap gap-4 items-stretch">
      <div className="flex-[2_1_420px] min-w-0"><MessageUsagePanel usage={usage} variant="compact" /></div>
      {usage && (
        <div className="flex-[1_1_260px] min-w-0 empty:hidden"><HeadsUpCard usage={usage} /></div>
      )}
    </div>
  );
}
