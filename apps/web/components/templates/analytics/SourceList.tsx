import type { JSX } from "react";
import { formatCount, sourceLabel, type SourceRow } from "@/lib/template-analytics";

export function SourceList({ sources }: { sources: SourceRow[] }): JSX.Element {
  return (
    <section aria-labelledby="sources-heading" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 id="sources-heading" className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Where messages were sent from</h2>
      {sources.length === 0 ? (
        <p data-testid="sources-empty" className="text-sm text-gray-500 dark:text-gray-400">No source data for this period.</p>
      ) : (
        <ul data-testid="source-list" className="divide-y divide-gray-100 dark:divide-gray-800 text-sm text-gray-800 dark:text-gray-200">
          {sources.map((s, i) => (
            <li key={`${s.source}-${i}`} className="flex items-center justify-between py-2">
              <span>{sourceLabel(s.source)}</span>
              <span className="tabular-nums">{formatCount(s.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
