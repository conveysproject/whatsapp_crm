import type { JSX } from "react";
import { bandRange, formatCount, formatInr, formatUsd, type BandView, type MessageUsage } from "@/lib/message-usage";

function fillPercent(count: number, band: BandView): number {
  if (band.to === null) return count >= band.from ? 100 : 0;
  if (count >= band.to) return 100;
  if (count < band.from) return 0;
  const span = band.to - Math.max(band.from - 1, 0);
  return Math.max(2, Math.min(100, Math.round(((count - Math.max(band.from - 1, 0)) / span) * 100)));
}

/** Where the customer is in the price bands. Published plans only; before that, only the free allowance is shown. */
export function BandProgress({ usage }: { usage: MessageUsage }): JSX.Element | null {
  const plan = usage.plan;
  if (!plan) return null;

  if (!plan.published) {
    const pct = Math.min(100, Math.round((usage.billable / Math.max(plan.freeAllowance, 1)) * 100));
    return (
      <section data-testid="free-allowance" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your free allowance</h2>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {formatCount(Math.min(usage.billable, plan.freeAllowance))} of {formatCount(plan.freeAllowance)} free messages used
          </span>
        </div>
        <div className="mt-4 h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" role="img" aria-label={`${pct}% of the free allowance used`}>
          <div className="h-3 bg-green-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Pricing for higher volumes will be shared with you before any charge starts.</p>
      </section>
    );
  }

  const bands = plan.bands;
  return (
    <section data-testid="band-progress" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Where you are in the bands</h2>
        {plan.next && plan.remainingToNextBand !== null && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {formatCount(plan.remainingToNextBand)} more messages until {plan.next.name} ({formatInr(plan.next.inr)})
          </span>
        )}
      </div>
      <div className="mt-5 flex gap-1.5">
        {bands.map((b) => {
          const isCurrent = b.name === plan.current.name;
          return (
            <div key={b.name} className="flex-1 min-w-0">
              <div className="h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div className="h-3.5 bg-green-600" style={{ width: `${fillPercent(usage.billable, b)}%` }} />
              </div>
              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{isCurrent ? `${b.name} · you are here` : b.name}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {bandRange(b)}{b.inr !== null && b.inr > 0 ? ` · ${formatInr(b.inr)}` : ""}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-lg bg-green-50 dark:bg-green-950 px-4 py-3 text-sm text-green-800 dark:text-green-300">
        You will never pay more than {formatInr(plan.cap.inr)} / {formatUsd(plan.cap.usd)} a month, however many messages you send.
      </p>
    </section>
  );
}
