import type { JSX } from "react";
import { formatCount, formatInr, formatUsd, periodLabel, resetLabel, bandRange, type MessageUsage } from "@/lib/message-usage";

function Card({ label, children, note, testId }: { label: string; children: React.ReactNode; note: string; testId?: string }): JSX.Element {
  return (
    <div data-testid={testId} className="flex-1 min-w-[240px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
      <div className="text-sm text-gray-600 dark:text-gray-400">{label}</div>
      <div className="mt-1.5 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-50">{children}</div>
      <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{note}</div>
    </div>
  );
}

function Price({ inr, usd }: { inr: number | null; usd: number | null }): JSX.Element {
  return (
    <>
      {formatInr(inr)} <span className="text-base font-medium text-gray-600 dark:text-gray-400">/ {formatUsd(usd)}</span>
    </>
  );
}

/** Three cards: messages this month, bill so far, expected this month. Prices appear only once the owner has published them. */
export function BillSummary({ usage }: { usage: MessageUsage }): JSX.Element {
  const plan = usage.plan;
  return (
    <div className="flex flex-wrap gap-4">
      <Card label="Messages this month" testId="bill-messages" note={usage.cycle ? `${periodLabel(usage.cycle)} (UTC), resets on ${resetLabel(usage.cycle)}` : "Current billing period"}>
        {formatCount(usage.billable)}
      </Card>

      {plan && plan.published ? (
        <>
          <Card label="Your bill so far" testId="bill-so-far" note={`${plan.current.name} · ${bandRange(plan.current)} messages`}>
            <Price inr={plan.current.inr} usd={plan.current.usd} />
          </Card>
          <Card
            label="Expected this month"
            testId="bill-expected"
            note={usage.expected ? `Next statement on ${resetLabel(usage.cycle) || "your next billing date"} · never more than ${formatInr(plan.cap.inr)}` : "Shown once there are a few days of data"}
          >
            {usage.expected ? <Price inr={usage.expected.band.inr} usd={usage.expected.band.usd} /> : <span className="text-gray-500">Not yet</span>}
          </Card>
        </>
      ) : (
        <Card
          label="Your bill"
          testId="bill-unpublished"
          note={`Your first ${formatCount(plan?.freeAllowance ?? 500)} messages in each billing period are free. Pricing is not final and nothing is charged today.`}
        >
          <span>₹0</span>
        </Card>
      )}
    </div>
  );
}
