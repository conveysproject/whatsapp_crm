"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchUsage, gateLevel, GATE_KEYS, GATE_LABELS, type GateLevel } from "@/lib/billing-usage";

const BAR: Record<GateLevel, string> = { ok: "bg-blue-500", warn: "bg-amber-400", blocked: "bg-red-500" };

/** Compact plan usage under the KPI grid. Renders nothing while loading; a small note on failure. */
export function PlanUsageStrip({ getToken }: { getToken: () => Promise<string | null> }): JSX.Element | null {
  const q = useQuery({
    queryKey: ["billing-usage"],
    queryFn: ({ signal }) => fetchUsage(getToken, signal),
    retry: false,
  });

  if (q.isPending) return null;
  if (!q.data) {
    return <p data-testid="plan-usage-unavailable" className="text-xs text-gray-500 dark:text-gray-400">Plan usage unavailable</p>;
  }
  const usage = q.data;
  const blocked = GATE_KEYS.some((k) => !usage.gates[k].allowed);

  return (
    <section
      data-testid="plan-usage"
      aria-label="Plan usage"
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plan usage</h2>
          {usage.plan && (
            <span data-testid="plan-badge" className="text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full capitalize break-words">
              {usage.plan}
            </span>
          )}
        </div>
        {blocked && (
          <Link data-testid="plan-upgrade" href="/settings/billing" className="text-xs font-semibold text-green-700 dark:text-green-400 underline underline-offset-2">
            Upgrade plan
          </Link>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        {GATE_KEYS.map((key) => {
          const g = usage.gates[key];
          const level = gateLevel(g);
          const pct = g.limit != null && g.limit > 0 ? Math.min(100, (g.current / g.limit) * 100) : 0;
          return (
            <div key={key} data-testid={`plan-gate-${key}`} className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-600 dark:text-gray-300 break-words">{GATE_LABELS[key]}</span>
                <span className={`tabular-nums font-medium ${level === "blocked" ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
                  {g.current} / {g.limit == null ? "Unlimited" : String(g.limit)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div data-testid="plan-bar" data-level={level} className={`h-full rounded-full ${BAR[level]}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
