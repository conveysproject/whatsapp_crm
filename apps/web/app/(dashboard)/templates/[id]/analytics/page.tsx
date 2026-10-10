"use client";
import { Suspense, use, type JSX } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PermissionGate } from "@/components/PermissionGate";
import { TemplateAnalyticsView } from "@/components/templates/analytics/TemplateAnalyticsView";
import { parseRange, type AnalyticsRange } from "@/lib/template-analytics";

function AnalyticsPageContent({ id }: { id: string }): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = parseRange(searchParams.get("range"));

  const onRangeChange = (r: AnalyticsRange): void => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", r);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <PermissionGate permission="templates_access">
      <TemplateAnalyticsView id={id} range={range} onRangeChange={onRangeChange} />
    </PermissionGate>
  );
}

export default function TemplateAnalyticsPage({ params }: { params: Promise<{ id: string }> }): JSX.Element {
  const { id } = use(params);
  return (
    <Suspense fallback={<div role="status" aria-label="Loading analytics" className="mx-auto h-40 max-w-5xl animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />}>
      <AnalyticsPageContent id={id} />
    </Suspense>
  );
}
