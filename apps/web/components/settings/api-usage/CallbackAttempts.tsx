"use client";

import { useState, type FormEvent, type JSX } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  callbackOutcomeLabel,
  fetchCallbackAttempts,
  formatDateTime,
  formatDuration,
  messageForUsageError,
  UUID_PATTERN,
  type CallbackAttemptRow,
} from "@/lib/api-usage";
import { Panel } from "./UsageTables";

export function CallbackAttempts(): JSX.Element {
  const [input, setInput] = useState("");
  const [messageId, setMessageId] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const q = useInfiniteQuery({
    queryKey: ["api-usage", "callbacks", messageId],
    queryFn: ({ pageParam }) => fetchCallbackAttempts({ messageId: messageId as string, cursor: pageParam }),
    enabled: messageId !== null,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const value = input.trim();
    if (!UUID_PATTERN.test(value)) {
      setInputError("Enter the message_uuid returned by the API.");
      return;
    }
    setInputError(null);
    setMessageId(value.toLowerCase());
  };

  const seen = new Set<string>();
  const rows: CallbackAttemptRow[] = [];
  for (const page of q.data?.pages ?? []) for (const r of page.data) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }

  let body: JSX.Element | null = null;
  if (messageId !== null) {
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
      body = <p className="text-sm text-gray-500 dark:text-gray-400">No delivery attempts found for this message.</p>;
    } else {
      body = (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="callback-attempts-table">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th scope="col" className="px-2 py-1.5 font-medium">Time</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Attempt</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Result</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">HTTP status</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Reason</th>
                  <th scope="col" className="px-2 py-1.5 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((r) => (
                  <tr key={r.id} data-testid="callback-attempt-row">
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.attempt}</td>
                    <td className="px-2 py-1.5">{callbackOutcomeLabel(r.outcome)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.httpStatus ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.reason ?? "—"}</td>
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
        </div>
      );
    }
  }

  return (
    <Panel title="Callback attempts" id="usage-callback-attempts">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mb-3" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="callback-message-uuid" className="text-xs text-gray-500 dark:text-gray-400">Message UUID</label>
          <input
            id="callback-message-uuid"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={inputError !== null}
            className="border rounded px-3 py-1.5 text-sm w-80 max-w-full bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button type="submit" className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800">Search</button>
      </form>
      {inputError && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{inputError}</p>}
      {body}
    </Panel>
  );
}
