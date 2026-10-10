import type { JSX } from "react";
import { formatCount, formatDateTime, formatRate, type FailureRow } from "@/lib/template-analytics";

export function FailureTable({ failures }: { failures: FailureRow[] }): JSX.Element {
  return (
    <section aria-labelledby="failures-heading" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 min-w-0">
      <h2 id="failures-heading" className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Why messages failed</h2>
      {failures.length === 0 ? (
        <p data-testid="failures-empty" className="py-4 text-sm text-gray-500 dark:text-gray-400">No failures in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="failure-table" className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 dark:text-gray-400">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Reason</th>
                <th scope="col" className="py-2 pr-3 font-medium">Meta code</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Count</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Share</th>
                <th scope="col" className="py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
              {failures.map((f, i) => (
                <tr key={`${f.code ?? "none"}-${i}`} data-testid="failure-row">
                  <td className="py-2 pr-3 min-w-[12rem]">{f.message || f.title || "Unknown reason"}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{f.code ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatCount(f.count)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatRate(f.share)}</td>
                  <td className="py-2 whitespace-nowrap">{formatDateTime(f.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
