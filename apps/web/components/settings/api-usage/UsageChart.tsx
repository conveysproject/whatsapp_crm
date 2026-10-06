"use client";

import type { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartData, formatCount, formatWindowStart, isChartEmpty, type ChartBucket, type Granularity, type SeriesPoint } from "@/lib/api-usage";

const COLORS = { success: "#16a34a", errors: "#dc2626", failedSignins: "#d97706" } as const;
const SERIES = [
  { key: "success", name: "Success", fill: COLORS.success, pattern: null },
  { key: "errors", name: "Errors", fill: "url(#usage-pattern-errors)", pattern: "errors" },
  { key: "failedSignins", name: "Failed sign-ins", fill: "url(#usage-pattern-signins)", pattern: "signins" },
] as const;

interface TipEntry { dataKey?: string | number; name?: string; value?: number | string }

/** Tooltip styled with the same `dark:` utility classes as the rest of the page (recharts' default is always light). */
function UsageTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartBucket } & TipEntry> }): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs shadow">
      <p className="font-medium mb-1">{bucket?.fullLabel ?? ""}</p>
      {payload.map((e) => (
        <p key={String(e.dataKey)} className="tabular-nums">{e.name}: {formatCount(Number(e.value ?? 0))}</p>
      ))}
    </div>
  );
}

export function UsageChart({ series, granularity, windowStart }: { series: SeriesPoint[]; granularity: Granularity; windowStart?: string }): JSX.Element {
  const data = chartData(series, granularity);
  const empty = isChartEmpty(data);
  const total = data.reduce((s, b) => s + b.total, 0);
  const summary = `Requests per ${granularity}: ${formatCount(total)} in total across ${data.length} ${granularity === "hour" ? "hours" : "days"}.`;
  const start = granularity === "hour" && windowStart ? formatWindowStart(windowStart) : "";

  return (
    <section aria-labelledby="usage-chart-heading" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 id="usage-chart-heading" className="text-sm font-semibold">Requests over time</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {granularity === "day" ? "Days in UTC" : "Hours in your local time"}
        </span>
      </div>
      {empty ? (
        <p data-testid="chart-empty" className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No requests in this period.
        </p>
      ) : (
        <div role="group" aria-label={summary} data-testid="usage-chart" className="text-gray-500 dark:text-gray-400">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <pattern id="usage-pattern-errors" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={COLORS.errors} />
                  <rect width="2.5" height="6" fill="#ffffff" fillOpacity={0.55} />
                </pattern>
                <pattern id="usage-pattern-signins" width="6" height="6" patternUnits="userSpaceOnUse">
                  <rect width="6" height="6" fill={COLORS.failedSignins} />
                  <circle cx="3" cy="3" r="1.4" fill="#ffffff" fillOpacity={0.7} />
                </pattern>
              </defs>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "currentColor" }} stroke="currentColor" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "currentColor" }} stroke="currentColor" allowDecimals={false} />
              <Tooltip content={<UsageTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.1 }} />
              <Legend />
              {SERIES.map((x) => (
                <Bar key={x.key} dataKey={x.key} name={x.name} stackId="r" fill={x.fill} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {granularity === "hour" && start && (
        <p data-testid="window-start-note" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Window starts at {start}; the first bucket is partial.
        </p>
      )}
      <table className="sr-only" data-testid="usage-chart-table">
        <caption>{summary}</caption>
        <thead>
          <tr>
            <th scope="col">{granularity === "day" ? "Day (UTC)" : "Hour"}</th>
            <th scope="col">Success</th>
            <th scope="col">Errors</th>
            <th scope="col">Failed sign-ins</th>
          </tr>
        </thead>
        <tbody>
          {data.map((b) => (
            <tr key={b.t}>
              <th scope="row">{b.fullLabel}</th>
              <td>{b.success}</td>
              <td>{b.errors}</td>
              <td>{b.failedSignins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
