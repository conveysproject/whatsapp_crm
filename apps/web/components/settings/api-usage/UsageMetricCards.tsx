import type { JSX } from "react";
import { errorCount, formatCount, formatDuration, formatPercent, successRate, type UsageCounts } from "@/lib/api-usage";

function Card({ label, value, sub, note, title, testId }: { label: string; value: string; sub?: string; note?: string; title?: string; testId: string }): JSX.Element {
  return (
    <div data-testid={testId} title={title} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
      {note && <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  );
}

export function UsageMetricCards({ totals }: { totals: UsageCounts }): JSX.Element {
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card testId="metric-requests" label="Requests" value={formatCount(totals.requests)} />
        <Card testId="metric-success-rate" label="Success rate" value={formatPercent(successRate(totals))} sub={`${formatCount(totals.success)} successful`} />
        <Card
          testId="metric-errors"
          label="Errors"
          value={formatCount(errorCount(totals))}
          sub={`${formatPercent(totals.errorRate)} error rate`}
          note="Not counting failed sign-ins"
          title="Failed requests, not counting wrong-token sign-in attempts"
        />
        <Card
          testId="metric-failed-signins"
          label="Failed sign-ins"
          value={formatCount(totals.failedSignins)}
          sub="Requests with a wrong token"
          title="Requests with a wrong token"
        />
        <Card testId="metric-messages" label="Messages via API" value={formatCount(totals.messages)} />
        <Card testId="metric-latency" label="Avg latency" value={formatDuration(totals.avgLatencyMs)} sub={`Max ${formatDuration(totals.maxLatencyMs)}`} />
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Success rate counts every request; error rate excludes failed sign-ins (wrong-token attempts).
      </p>
    </div>
  );
}
