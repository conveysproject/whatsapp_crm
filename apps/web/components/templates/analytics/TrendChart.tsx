"use client";

import type { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount, type DailyPoint } from "@/lib/template-analytics";

const SERIES = [
  { key: "sent", name: "Sent", fill: "#3b82f6" },
  { key: "delivered", name: "Delivered", fill: "#16a34a" },
  { key: "read", name: "Read", fill: "#9333ea" },
  { key: "failed", name: "Failed", fill: "#dc2626" },
] as const;

interface TipEntry { dataKey?: string | number; name?: string; value?: number | string }

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<TipEntry>; label?: string | number }): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs shadow">
      <p className="font-medium mb-1">{String(label ?? "")}</p>
      {payload.map((e) => (
        <p key={String(e.dataKey)} className="tabular-nums">{e.name}: {formatCount(Number(e.value ?? 0))}</p>
      ))}
    </div>
  );
}

export function TrendChart({ daily }: { daily: DailyPoint[] }): JSX.Element {
  const total = daily.reduce((s, d) => s + d.sent, 0);
  const summary = `Daily messages: ${formatCount(total)} sent across ${daily.length} ${daily.length === 1 ? "day" : "days"} (UTC).`;
  return (
    <section aria-labelledby="trend-heading" className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 id="trend-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100">Daily trend</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">Days in UTC</span>
      </div>
      {daily.length === 0 ? (
        <p data-testid="trend-empty" className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No daily data for this period.</p>
      ) : (
        <div role="group" aria-label={summary} data-testid="trend-chart" className="text-gray-500 dark:text-gray-400 min-w-0">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 11, fill: "currentColor" }} stroke="currentColor" interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "currentColor" }} stroke="currentColor" allowDecimals={false} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.1 }} />
              <Legend />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.fill} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* sr-only goes on a block wrapper: it clips its children (overflow hidden); on the <table> itself the browser does
          not clip. The section is `relative` so this absolutely positioned wrapper is measured against the section and
          clipped by the app's scrolling <main>; without a positioned ancestor it is measured against the whole page and
          stretches the document, which added a second scrollbar and a blank band at the bottom. */}
      <div className="sr-only">
      <table data-testid="trend-table">
        <caption>{summary}</caption>
        <thead>
          <tr>
            <th scope="col">Day (UTC)</th>
            <th scope="col">Sent</th>
            <th scope="col">Delivered</th>
            <th scope="col">Read</th>
            <th scope="col">Failed</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.sent}</td>
              <td>{d.delivered}</td>
              <td>{d.read}</td>
              <td>{d.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
