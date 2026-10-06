"use client";

import type { JSX } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import {
  appendRows,
  credentialDisplayName,
  endpointLabel,
  errorClassLabel,
  fetchFailedRequests,
  formatDateTime,
  formatDuration,
  messageForUsageError,
  type RequestRow,
  type UsageRange,
} from "@/lib/api-usage";
import { Panel } from "./UsageTables";

export function RecentFailedRequests({
  apiKeyId,
  range,
  credentialNames,
}: {
  apiKeyId: string | null;
  range: UsageRange;
  credentialNames: ReadonlyMap<string, string>;
}): JSX.Element {
  const q = useInfiniteQuery({
    // The range and credential are part of the key, so changing either starts a NEW query from page 1 (a stale cursor is never reused).
    queryKey: ["api-usage", "failed", range, apiKeyId],
    queryFn: ({ pageParam }) => fetchFailedRequests({ cursor: pageParam, apiKeyId, range }),
    placeholderData: keepPreviousData,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });

  const rows = (q.data?.pages ?? []).reduce<RequestRow[]>((acc, page) => appendRows(acc, page.data), []);

  let body: JSX.Element;
  if (q.error) {
    body = (
      <div role="alert" className="flex items-center justify-between gap-3 text-sm rounded-md bg-red-50 dark:bg-red-950 border border-red-200 px-3 py-2 text-red-700 dark:text-red-300">
        <span>{messageForUsageError(q.error)}</span>
        <button type="button" onClick={() => { void q.refetch(); }} className="px-3 py-1 border border-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900">Retry</button>
      </div>
    );
  } else if (q.isLoading) {
    body = <p role="status" className="text-sm text-gray-500">Loading…</p>;
  } else if (rows.length === 0) {
    body = <p className="text-sm text-gray-500 dark:text-gray-400">No failed requests in the selected period.</p>;
  } else {
    body = (
      <div aria-busy={q.isPlaceholderData} className={q.isPlaceholderData ? "opacity-60" : ""}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="failed-requests-table">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th scope="col" className="px-2 py-1.5 font-medium">Time</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Endpoint</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Status</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Error</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Credential</th>
                <th scope="col" className="px-2 py-1.5 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} data-testid="failed-request-row">
                  <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                  <td className="px-2 py-1.5">{endpointLabel(r.endpoint)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.statusCode}</td>
                  <td className="px-2 py-1.5">{errorClassLabel(r.errorClass)}</td>
                  <td className="px-2 py-1.5">{credentialDisplayName(r.apiKeyId, credentialNames)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatDuration(r.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.hasNextPage && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => { void q.fetchNextPage(); }}
              disabled={q.isFetchingNextPage || q.isPlaceholderData}
              className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {q.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Panel title="Recent failed requests" id="usage-recent-failed">
      <p className="-mt-2 mb-3 text-xs text-gray-500 dark:text-gray-400">Failed requests in the selected period</p>
      {body}
    </Panel>
  );
}
