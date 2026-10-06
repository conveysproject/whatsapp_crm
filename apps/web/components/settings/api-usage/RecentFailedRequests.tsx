"use client";

import type { JSX } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  appendRows,
  endpointLabel,
  errorClassLabel,
  fetchFailedRequests,
  formatDateTime,
  formatDuration,
  messageForUsageError,
  type RequestRow,
} from "@/lib/api-usage";
import { Panel } from "./UsageTables";

export function RecentFailedRequests({
  apiKeyId,
  credentialNames,
}: {
  apiKeyId: string | null;
  credentialNames: ReadonlyMap<string, string>;
}): JSX.Element {
  const q = useInfiniteQuery({
    queryKey: ["api-usage", "failed", apiKeyId],
    queryFn: ({ pageParam }) => fetchFailedRequests({ cursor: pageParam, apiKeyId }),
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
    body = <p className="text-sm text-gray-500">Loading…</p>;
  } else if (rows.length === 0) {
    body = <p className="text-sm text-gray-500 dark:text-gray-400">No failed requests recorded.</p>;
  } else {
    body = (
      <>
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
                  <td className="px-2 py-1.5">{(r.apiKeyId && credentialNames.get(r.apiKeyId)) || "—"}</td>
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
              disabled={q.isFetchingNextPage}
              className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {q.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </>
    );
  }

  return <Panel title="Recent failed requests" id="usage-recent-failed">{body}</Panel>;
}
