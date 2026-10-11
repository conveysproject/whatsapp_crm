import type { JSX } from "react";
import { barHeights, formatCount, periodLabel, sourceRows, type MessageUsage } from "@/lib/message-usage";

/** "Messages per day" chart and the "What was counted" list, side by side (stacked on phones). */
export function UsageDetails({ usage }: { usage: MessageUsage }): JSX.Element {
  const heights = barHeights(usage.daily);
  const rows = sourceRows(usage.bySource);
  return (
    <div className="flex flex-wrap gap-4 items-stretch">
      <section className="flex-[2_1_420px] min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messages per day</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{periodLabel(usage.cycle)}, counted in UTC days</p>
        <div
          role="img"
          aria-label={`Messages per day, ${formatCount(usage.billable)} in total`}
          className="flex items-end gap-1 h-36 border-b border-gray-200 dark:border-gray-700"
        >
          {usage.daily.map((d, i) => (
            <div
              key={d.day}
              title={`${d.day}: ${formatCount(d.billable)}`}
              className="flex-1 min-w-0 rounded-t bg-green-600"
              style={{ height: `${heights[i] ?? 0}%`, minHeight: heights[i] ? undefined : 2, opacity: heights[i] ? 1 : 0.25 }}
            />
          ))}
        </div>
        {usage.daily.length > 0 && (
          <div className="mt-1.5 flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>{usage.daily[0]?.day.slice(5)}</span>
            <span>{usage.daily[usage.daily.length - 1]?.day.slice(5)}</span>
          </div>
        )}
      </section>

      <section className="flex-[1_1_260px] min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">What was counted</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">No messages counted yet this month.</p>
        ) : (
          <ul data-testid="message-usage-sources" className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300 break-words">{r.label}</span>
                <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">{formatCount(r.count)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          Counted: the messages Meta charges for. A message Meta does not charge for, for example a chat reply inside its free 24-hour customer-service window, is not counted. Messages you receive and messages that fail are never counted. Counts before 12 October 2026 are estimates that include every message sent.
        </p>
      </section>
    </div>
  );
}
