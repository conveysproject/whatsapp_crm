import type { JSX } from "react";
import { bandRange, formatInr, formatUsd, type MessageUsage } from "@/lib/message-usage";

/** "Monthly bands" table. Renders nothing until the owner publishes prices. */
export function BandTable({ usage }: { usage: MessageUsage }): JSX.Element | null {
  const plan = usage.plan;
  if (!plan || !plan.published) return null;
  return (
    <section data-testid="band-table" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly bands</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Rupees first, US dollars second.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="py-2 pr-3 font-semibold">Band</th>
              <th className="py-2 pr-3 font-semibold">Messages per month</th>
              <th className="py-2 pr-3 font-semibold">Monthly bill (₹)</th>
              <th className="py-2 font-semibold">Monthly bill ($)</th>
            </tr>
          </thead>
          <tbody>
            {plan.bands.map((b) => {
              const isCurrent = b.name === plan.current.name;
              return (
                <tr key={b.name} className={`border-b border-gray-100 dark:border-gray-800 ${isCurrent ? "bg-green-50 dark:bg-green-950 font-semibold" : ""}`}>
                  <td className="py-2.5 pr-3">{isCurrent ? `${b.name} (current)` : b.name}</td>
                  <td className="py-2.5 pr-3">{bandRange(b)}</td>
                  <td className="py-2.5 pr-3">{formatInr(b.inr)}</td>
                  <td className="py-2.5">{formatUsd(b.usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
