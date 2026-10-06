"use client";

import type { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartData, formatCount, isChartEmpty, type Granularity, type SeriesPoint } from "@/lib/api-usage";

const COLORS = { success: "#22c55e", errors: "#ef4444", failedSignins: "#f59e0b" } as const;

export function UsageChart({ series, granularity }: { series: SeriesPoint[]; granularity: Granularity }): JSX.Element {
  const data = chartData(series, granularity);
  const empty = isChartEmpty(data);
  const total = data.reduce((s, b) => s + b.total, 0);
  const summary = `Requests per ${granularity}: ${formatCount(total)} in total across ${data.length} ${granularity === "hour" ? "hours" : "days"}.`;

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
        <div role="group" aria-label={summary} data-testid="usage-chart">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" name="Success" stackId="r" fill={COLORS.success} isAnimationActive={false} />
              <Bar dataKey="errors" name="Errors" stackId="r" fill={COLORS.errors} isAnimationActive={false} />
              <Bar dataKey="failedSignins" name="Failed sign-ins" stackId="r" fill={COLORS.failedSignins} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
              <th scope="row">{b.label}</th>
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
