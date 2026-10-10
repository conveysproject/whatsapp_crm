import type { JSX } from "react";
import { formatCount, formatDateTime, formatRate, type TemplateAnalytics } from "@/lib/template-analytics";

function Card({ label, value, testId, hint }: { label: string; value: string; testId: string; hint?: string }): JSX.Element {
  return (
    <div data-testid={testId} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 min-w-0">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100 break-words">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export function SummaryCards({ data }: { data: TemplateAnalytics }): JSX.Element {
  return (
    <section aria-label="Summary" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card testId="card-sent" label="Sent" value={formatCount(data.sent)} />
        <Card testId="card-delivered" label="Delivered" value={formatCount(data.delivered)} />
        <Card testId="card-read" label="Read" value={formatCount(data.read)} />
        <Card testId="card-failed" label="Failed" value={formatCount(data.failed)} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card testId="card-delivery-rate" label="Delivery rate" value={formatRate(data.rates.delivery)} />
        <Card testId="card-read-rate" label="Read rate" value={formatRate(data.rates.read)} />
        <Card testId="card-failure-rate" label="Failure rate" value={formatRate(data.rates.failure)} />
        <Card testId="card-recipients" label="Unique recipients" value={formatCount(data.reach.uniqueRecipients)} />
        <Card testId="card-last-sent" label="Last sent" value={formatDateTime(data.reach.lastSentAt)} />
        {data.inProgress > 0 && <Card testId="card-in-progress" label="In progress" value={formatCount(data.inProgress)} hint="Waiting to be sent" />}
      </div>
    </section>
  );
}
