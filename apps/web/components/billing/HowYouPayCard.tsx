import type { JSX } from "react";
import { dueDateLabel, formatInr, formatMinor, formatUsd, type MessageUsage } from "@/lib/message-usage";

/**
 * "How you pay": no card is stored. Statements are paid through a secure link sent by email (or the Pay now button here).
 * Shows the statement that is due, if any, with a direct Pay now button.
 */
export function HowYouPayCard({ usage }: { usage: MessageUsage | null }): JSX.Element {
  const due = usage?.statements.find((s) => s.status === "issued") ?? null;
  return (
    <section data-testid="how-you-pay" className="flex-1 min-w-[300px] rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-gray-900">How you pay</h2>
      <p className="text-sm text-gray-600">
        No card is stored with us. When a statement is issued we email your billing contact a secure payment link, due 7 days later. You can pay by UPI, card or netbanking, and the same link is available as Pay now in the statements table.
      </p>
      {due ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            Statement due{due.dueAt ? ` ${dueDateLabel(due.dueAt)}` : ""}:{" "}
            {due.totalMinor !== null ? formatMinor(due.currency, due.totalMinor) : `${formatInr(due.amountInr)} / ${formatUsd(due.amountUsd)}`}
          </p>
          {due.paymentUrl ? (
            <a href={due.paymentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block min-h-[44px] rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800">
              Pay now
            </a>
          ) : (
            <p className="mt-1 text-xs">Your payment link is being prepared. We will email it to you shortly.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-700">Nothing is due right now.</p>
      )}
    </section>
  );
}
