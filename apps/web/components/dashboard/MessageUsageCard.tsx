"use client";

import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMessageUsage } from "@/lib/message-usage";
import { MessageUsagePanel } from "@/components/billing/MessageUsagePanel";

/** Dashboard card for admins and billing-permission holders. Renders nothing while loading. */
export function MessageUsageCard({ getToken }: { getToken: () => Promise<string | null> }): JSX.Element | null {
  const q = useQuery({
    queryKey: ["billing-message-usage"],
    queryFn: ({ signal }) => fetchMessageUsage(getToken, signal),
    retry: false,
    staleTime: 60_000,
  });
  if (q.isPending) return null;
  return <MessageUsagePanel usage={q.data ?? null} variant="compact" />;
}
