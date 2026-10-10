"use client";

import type { JSX } from "react";
import Link from "next/link";
import { ANALYTICS_RANGES, formatDateTime, type AnalyticsRange, type TemplateInfo } from "@/lib/template-analytics";

const STATUS_CHIP: Record<string, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};
// Same status to colour mapping as the templates list.
const STATUS_COLOR: Record<string, keyof typeof STATUS_CHIP> = {
  draft: "gray", pending: "yellow", approved: "green", rejected: "red", paused: "yellow", disabled: "red",
  in_appeal: "yellow", flagged: "yellow", limit_exceeded: "red", pending_deletion: "gray", archived: "gray",
};
const QUALITY_DOT: Record<string, string> = { GREEN: "bg-green-500", YELLOW: "bg-yellow-400", RED: "bg-red-500" };

const btn =
  "inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500";

export interface AnalyticsHeaderProps {
  template: TemplateInfo | null;
  range: AnalyticsRange;
  onRangeChange: (r: AnalyticsRange) => void;
  spanLabel: string;
  onRefresh: () => void;
  refreshing: boolean;
  onExport: (() => void) | null;
}

export function AnalyticsHeader({ template, range, onRangeChange, spanLabel, onRefresh, refreshing, onExport }: AnalyticsHeaderProps): JSX.Element {
  const status = template?.status ?? "";
  return (
    <header className="space-y-3" data-testid="analytics-header">
      <Link href="/templates" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        &larr; Back to templates
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 break-words">
            {template?.name || "Template analytics"}
          </h1>
          {template && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
              <span>{template.language}</span>
              <span>{template.category}</span>
              {status && (
                <span data-testid="status-chip" className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CHIP[STATUS_COLOR[status] ?? "gray"]}`}>
                  {status.replace(/_/g, " ")}
                </span>
              )}
              {template.qualityScore && (
                <span data-testid="quality" className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={`h-2 w-2 rounded-full ${QUALITY_DOT[template.qualityScore] ?? "bg-gray-400"}`} />
                  Quality: {template.qualityScore}
                </span>
              )}
              <span>Last edited: {formatDateTime(template.lastEditedAt)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className={btn} onClick={onExport ?? undefined} disabled={!onExport}>
            Export CSV
          </button>
        </div>
      </div>
      {template?.previewText ? (
        <p data-testid="preview-text" className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-200">
          {template.previewText}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Date range" className="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-600">
          {ANALYTICS_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              data-testid={`range-${r.value}`}
              aria-pressed={range === r.value}
              onClick={() => onRangeChange(r.value)}
              className={`px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500 ${
                range === r.value
                  ? "bg-green-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {spanLabel && <span data-testid="date-span" className="text-xs text-gray-500 dark:text-gray-400">{spanLabel}</span>}
      </div>
    </header>
  );
}
