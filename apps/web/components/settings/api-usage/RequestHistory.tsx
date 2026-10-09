"use client";

import { Fragment, useState, type JSX } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  credentialDisplayName,
  endpointLabel,
  fetchPayloadDetail,
  fetchPayloads,
  formatDateTime,
  formatDuration,
  messageForUsageError,
  PAYLOAD_BODY_LIMIT_LABEL,
  prettyBody,
  type PayloadSummary,
} from "@/lib/api-usage";
import { Panel } from "./UsageTables";

const preCls = "text-xs whitespace-pre-wrap break-all rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 max-h-72 overflow-auto";

function BodyBlock({ label, body, truncated }: { label: string; body: string | null; truncated: boolean }): JSX.Element {
  const text = prettyBody(body);
  const copy = (): void => {
    try {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    } catch {
      // clipboard unavailable: nothing to do
    }
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold">{label}</h3>
        <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800">Copy</button>
      </div>
      {/* Bodies are customer-controlled: always rendered as plain text children, never as HTML. */}
      <pre className={preCls} data-testid={`payload-${label.toLowerCase()}`}>{text === "" ? "(empty)" : text}</pre>
      {truncated && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Body was truncated at {PAYLOAD_BODY_LIMIT_LABEL}.</p>}
    </div>
  );
}

function PayloadDetailView({ id }: { id: string }): JSX.Element {
  const q = useQuery({ queryKey: ["api-usage", "payload", id], queryFn: () => fetchPayloadDetail(id), retry: false });
  if (q.error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 text-sm rounded-md bg-red-50 dark:bg-red-950 border border-red-200 px-3 py-2 text-red-700 dark:text-red-300">
        <span>{messageForUsageError(q.error)}</span>
        <button type="button" onClick={() => { void q.refetch(); }} className="px-3 py-1 border border-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900">Retry</button>
      </div>
    );
  }
  if (!q.data) return <p role="status" className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BodyBlock label="Request" body={q.data.requestBody} truncated={q.data.requestTruncated} />
      <BodyBlock label="Response" body={q.data.responseBody} truncated={q.data.responseTruncated} />
    </div>
  );
}

export function RequestHistory({
  apiKeyId,
  credentialNames,
}: {
  apiKeyId: string | null;
  credentialNames: ReadonlyMap<string, string>;
}): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ["api-usage", "payloads", apiKeyId],
    queryFn: ({ pageParam }) => fetchPayloads({ cursor: pageParam, apiKeyId }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });

  const pages = q.data?.pages ?? [];
  const enabled = pages.length === 0 ? true : pages[0]!.enabled;
  const seen = new Set<string>();
  const rows: PayloadSummary[] = [];
  for (const page of pages) for (const r of page.data) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }

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
  } else if (!enabled && rows.length === 0) {
    body = <p className="text-sm text-gray-500 dark:text-gray-400">Request logging is not enabled for this platform yet.</p>;
  } else if (rows.length === 0) {
    body = <p className="text-sm text-gray-500 dark:text-gray-400">No stored requests yet.</p>;
  } else {
    body = (
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="request-history-table">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th scope="col" className="px-2 py-1.5 font-medium">Time</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Endpoint</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Status</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Error code</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Credential</th>
                <th scope="col" className="px-2 py-1.5 font-medium text-right">Duration</th>
                <th scope="col" className="px-2 py-1.5"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => {
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr data-testid="request-history-row">
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td className="px-2 py-1.5">{endpointLabel(r.endpoint)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.statusCode}</td>
                      <td className="px-2 py-1.5">{r.errorCode ?? "—"}</td>
                      <td className="px-2 py-1.5">{credentialDisplayName(r.apiKeyId, credentialNames)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatDuration(r.durationMs)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : r.id)}
                          className="px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          {open ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr data-testid="request-history-detail">
                        <td colSpan={7} className="px-2 py-2"><PayloadDetailView id={r.id} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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

  return (
    <Panel title="Request history (kept 365 days)" id="usage-request-history">
      <p className="-mt-2 mb-3 text-xs text-gray-500 dark:text-gray-400">Stored request and response bodies for recent API calls</p>
      {body}
    </Panel>
  );
}
