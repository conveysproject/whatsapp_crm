import type { JSX } from "react";
import Link from "next/link";
import { alertText, barHeights, formatCount, formatInr, formatUsd, monthLabel, sourceRows, type MessageUsage } from "@/lib/message-usage";

interface Props {
  usage: MessageUsage | null;
  /** compact: dashboard card with a link to billing; full: billing page with the by-type breakdown and the "what counts" note. */
  variant: "compact" | "full";
}

function updatedText(updatedAt: string | null): string {
  if (!updatedAt) return "Counts update every hour.";
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "Counts update every hour.";
  return `Updated ${d.toISOString().slice(0, 16).replace("T", " ")} UTC. Counts update every hour.`;
}

function DailyBars({ usage }: { usage: MessageUsage }): JSX.Element {
  const heights = barHeights(usage.daily);
  return (
    <div
      role="img"
      aria-label={`Messages per day this month, ${formatCount(usage.billable)} in total`}
      className="flex items-end gap-0.5 h-16 border-b border-gray-200 dark:border-gray-700"
    >
      {usage.daily.map((d, i) => (
        <div
          key={d.day}
          title={`${d.day}: ${formatCount(d.billable)}`}
          className="flex-1 min-w-0 rounded-t bg-green-600 dark:bg-green-500"
          style={{ height: `${heights[i] ?? 0}%`, minHeight: heights[i] ? undefined : 2, opacity: heights[i] ? 1 : 0.25 }}
        />
      ))}
    </div>
  );
}

/** "Messages this month": the organization's billable outbound message count. Counts only, no prices. */
export function MessageUsagePanel({ usage, variant }: Props): JSX.Element {
  if (!usage) {
    return (
      <section data-testid="message-usage-unavailable" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Messages this month</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Message count is unavailable right now. Please try again in a few minutes.</p>
      </section>
    );
  }
  const rows = sourceRows(usage.bySource);
  const full = variant === "full";
  const headsUp = [...usage.alerts].reverse().map((al) => alertText(al.kind, usage.plan)).find((t): t is string => t !== null) ?? null;

  return (
    <section
      data-testid="message-usage"
      aria-label="Messages this month"
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Messages this month</h2>
        {!full && (
          <Link href="/settings/billing" className="text-sm font-medium text-green-700 dark:text-green-400 underline underline-offset-2">
            View billing
          </Link>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-testid="message-usage-total" className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-50">{formatCount(usage.billable)}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{monthLabel(usage.month)}</span>
      </div>

      {usage.plan?.published ? (
        <p data-testid="message-usage-plan" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {usage.plan.current.name} · bill so far {formatInr(usage.plan.current.inr)} / {formatUsd(usage.plan.current.usd)}
          {usage.plan.next && usage.plan.remainingToNextBand !== null
            ? `. ${formatCount(usage.plan.remainingToNextBand)} more messages until ${usage.plan.next.name} (${formatInr(usage.plan.next.inr)}).`
            : "."}
        </p>
      ) : usage.plan ? (
        <p data-testid="message-usage-free" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {formatCount(Math.min(usage.billable, usage.plan.freeAllowance))} of {formatCount(usage.plan.freeAllowance)} free messages used. Nothing is charged today.
        </p>
      ) : null}

      {!full && headsUp && (
        <p data-testid="message-usage-heads-up" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Heads-up: </span>{headsUp}
        </p>
      )}

      {usage.daily.length > 0 && (
        <div className="mt-4">
          <DailyBars usage={usage} />
          <div className="mt-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{usage.daily[0]?.day.slice(5)}</span>
            <span>{usage.daily[usage.daily.length - 1]?.day.slice(5)}</span>
          </div>
        </div>
      )}

      {full && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">What was counted</h3>
          {rows.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No messages counted yet this month.</p>
          ) : (
            <ul data-testid="message-usage-sources" className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300 break-words">{r.label}</span>
                  <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{formatCount(r.count)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Counted: the messages Meta charges for. If Meta does not charge for a message, for example a chat reply inside its free 24-hour customer-service window, it is not counted. Messages you receive and messages that fail are never counted. Counts before 12 October 2026 are estimates that include every message sent.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{updatedText(usage.updatedAt)}</p>
    </section>
  );
}
