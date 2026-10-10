"use client";

import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AnalyticsError as AnalyticsFetchError,
  dateSpanLabel,
  downloadCsv,
  fetchTemplateAnalytics,
  isEmptyAnalytics,
  messageForAnalyticsError,
  type AnalyticsRange,
  type TemplateAnalytics,
} from "@/lib/template-analytics";
import { AnalyticsHeader } from "./AnalyticsHeader";
import { SummaryCards } from "./SummaryCards";
import { FunnelBars } from "./FunnelBars";
import { TrendChart } from "./TrendChart";
import { FailureTable } from "./FailureTable";
import { SourceList } from "./SourceList";
import { AnalyticsEmpty, AnalyticsError, AnalyticsMessage, AnalyticsSkeleton } from "./AnalyticsStates";

export function TemplateAnalyticsView({ id, range, onRangeChange }: { id: string; range: AnalyticsRange; onRangeChange: (r: AnalyticsRange) => void }): JSX.Element {
  const q = useQuery<TemplateAnalytics, Error>({
    queryKey: ["template-analytics", id, range],
    queryFn: () => fetchTemplateAnalytics(id, range),
    retry: false,
  });
  const data = q.data;
  const err = q.error;
  const code = err instanceof AnalyticsFetchError ? err.code : "";

  let body: JSX.Element;
  if (data) {
    body = isEmptyAnalytics(data) ? (
      <AnalyticsEmpty />
    ) : (
      <div className="space-y-4">
        <SummaryCards data={data} />
        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelBars data={data} />
          <SourceList sources={data.sources} />
        </div>
        <TrendChart daily={data.daily} />
        <FailureTable failures={data.failures} />
        {data.attributionNote && (
          <p data-testid="attribution-note" className="text-xs text-gray-500 dark:text-gray-400">{data.attributionNote}</p>
        )}
      </div>
    );
  } else if (q.isLoading) {
    body = <AnalyticsSkeleton />;
  } else if (code === "FORBIDDEN") {
    body = <AnalyticsMessage testId="analytics-forbidden" message="You do not have access to template analytics" />;
  } else if (code === "NOT_FOUND") {
    body = <AnalyticsMessage testId="analytics-not-found" message="Template not found" />;
  } else {
    body = <AnalyticsError message={messageForAnalyticsError(err)} onRetry={() => void q.refetch()} />;
  }

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-4" data-testid="template-analytics">
      <AnalyticsHeader
        template={data?.template ?? null}
        range={range}
        onRangeChange={onRangeChange}
        spanLabel={data ? dateSpanLabel(data.daily, range) : ""}
        onRefresh={() => void q.refetch()}
        refreshing={q.isFetching}
        onExport={data ? () => downloadCsv(data, range) : null}
      />
      {body}
    </div>
  );
}
