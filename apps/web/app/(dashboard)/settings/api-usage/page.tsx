"use client";

import { JSX, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PermissionGate } from "@/components/PermissionGate";
import { UsageMetricCards } from "@/components/settings/api-usage/UsageMetricCards";
import { UsageChart } from "@/components/settings/api-usage/UsageChart";
import { CredentialTable, EndpointTable, FailureReasons, MessageStatusChips } from "@/components/settings/api-usage/UsageTables";
import { RecentFailedRequests } from "@/components/settings/api-usage/RecentFailedRequests";
import {
  DEFAULT_RANGE,
  fetchSummary,
  isNotAvailable,
  messageForUsageError,
  USAGE_RANGES,
  type UsageRange,
  type UsageSummary,
} from "@/lib/api-usage";

const selectCls = "border rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500";

function GettingStarted(): JSX.Element {
  return (
    <div data-testid="usage-empty" className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center space-y-2">
      <p className="text-sm font-medium">No API requests in this period</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Create an API credential and send your first request to the WBMSG API. Usage appears here within a few seconds.
      </p>
      <Link href="/settings/vendor-settings" className="inline-block text-sm text-blue-600 hover:underline">
        Go to Advanced Settings → API Credentials
      </Link>
    </div>
  );
}

function ApiUsageBody(): JSX.Element {
  const [range, setRange] = useState<UsageRange>(DEFAULT_RANGE);
  const [apiKeyId, setApiKeyId] = useState<string | null>(null);
  // A filtered summary only lists the selected credential, so remember every credential seen to keep the dropdown complete.
  const [known, setKnown] = useState<ReadonlyMap<string, { name: string; revoked: boolean }>>(new Map());

  const q = useQuery<UsageSummary, Error>({
    queryKey: ["api-usage", "summary", range, apiKeyId],
    queryFn: () => fetchSummary(range, apiKeyId),
    placeholderData: keepPreviousData,
    retry: false,
  });

  useEffect(() => {
    if (!q.data || q.data.byCredential.length === 0) return;
    setKnown((prev) => {
      const next = new Map(prev);
      for (const c of q.data.byCredential) next.set(c.apiKeyId, { name: c.name, revoked: c.revoked });
      return next;
    });
  }, [q.data]);

  const names = useMemo(() => new Map([...known].map(([id, c]) => [id, c.name])), [known]);
  const options = useMemo(() => [...known].sort((a, b) => a[1].name.localeCompare(b[1].name)), [known]);

  if (isNotAvailable(q.error)) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">API Usage</h1>
        <p data-testid="usage-not-available" className="mt-6 text-sm text-gray-600 dark:text-gray-300">
          API usage is not available for this organization.
        </p>
      </div>
    );
  }

  const s = q.data;
  const showEmpty = s !== undefined && !apiKeyId && s.totals.requests === 0 && s.byCredential.length === 0;

  let content: JSX.Element;
  if (q.error && !s) {
    content = (
      <div role="alert" className="flex items-center justify-between gap-3 text-sm rounded-md bg-red-50 dark:bg-red-950 border border-red-200 px-3 py-2 text-red-700 dark:text-red-300">
        <span>{messageForUsageError(q.error)}</span>
        <button type="button" onClick={() => { void q.refetch(); }} disabled={q.isFetching} className="px-3 py-1 border border-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900 disabled:opacity-50">Retry</button>
      </div>
    );
  } else if (!s) {
    content = <p className="py-12 text-center text-sm text-gray-400">Loading…</p>;
  } else if (showEmpty) {
    content = <GettingStarted />;
  } else {
    content = (
      <div className={`space-y-4 ${q.isPlaceholderData ? "opacity-60" : ""}`}>
        {q.error && (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm rounded-md bg-red-50 dark:bg-red-950 border border-red-200 px-3 py-2 text-red-700 dark:text-red-300">
            <span>{messageForUsageError(q.error)}</span>
            <button type="button" onClick={() => { void q.refetch(); }} className="px-3 py-1 border border-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900">Retry</button>
          </div>
        )}
        {s.range.approximate && (
          <p role="note" data-testid="approximate-note" className="text-xs rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 text-amber-800 dark:text-amber-200 px-3 py-2">
            Hourly numbers are approximate (some successful requests are sampled).
          </p>
        )}
        <UsageMetricCards totals={s.totals} />
        <UsageChart series={s.series} granularity={s.range.granularity} />
        {s.range.granularity === "hour" && (
          <p data-testid="hourly-note" className="text-xs text-gray-500 dark:text-gray-400">
            Failed sign-ins in the hourly view can be undercounted during a flood of wrong-token requests.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <EndpointTable rows={s.byEndpoint} />
          <MessageStatusChips counts={s.messagesByStatus} />
        </div>
        <CredentialTable rows={s.byCredential} selectedId={apiKeyId} onSelect={setApiKeyId} />
        <FailureReasons rows={s.topFailureReasons} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">API Usage</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Requests, errors and messages sent through the WBMSG API.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="usage-range">Time range</label>
          <select id="usage-range" value={range} onChange={(e) => setRange(e.target.value as UsageRange)} className={selectCls}>
            {USAGE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="usage-credential">Credential</label>
          <select id="usage-credential" value={apiKeyId ?? ""} onChange={(e) => setApiKeyId(e.target.value || null)} className={selectCls}>
            <option value="">All credentials</option>
            {options.map(([id, c]) => <option key={id} value={id}>{c.name}{c.revoked ? " (revoked)" : ""}</option>)}
          </select>
        </div>
      </div>

      {content}

      {!showEmpty && !(q.error && !s) && s !== undefined && <RecentFailedRequests apiKeyId={apiKeyId} credentialNames={names} />}
    </div>
  );
}

export default function ApiUsagePage(): JSX.Element {
  return (
    <PermissionGate permission="settings_access" sub="settings_api_key">
      <ApiUsageBody />
    </PermissionGate>
  );
}
