import type { JSX } from "react";
import Link from "next/link";
import type { DashboardData, Funnel } from "@/lib/dashboard";

function rate(n: number, sent: number): number | null {
  return sent > 0 ? Math.round((n / sent) * 100) : null;
}
function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

const STAGES: ReadonlyArray<{ key: "sent" | "delivered" | "read" | "failed"; label: string; bar: string }> = [
  { key: "sent", label: "Sent", bar: "bg-green-500" },
  { key: "delivered", label: "Delivered", bar: "bg-green-400" },
  { key: "read", label: "Read", bar: "bg-green-300" },
  { key: "failed", label: "Failed", bar: "bg-red-400" },
];

export function CampaignFunnel({ funnel }: { funnel: DashboardData["campaignFunnel"] }): JSX.Element {
  if (!funnel) {
    return (
      <section aria-label="Campaign funnel" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Last campaign</h3>
        <p data-testid="funnel-empty" className="mt-3 text-sm text-gray-500 dark:text-gray-400">No campaigns sent yet</p>
        <Link href="/campaigns/new" className="mt-2 inline-block text-sm font-medium text-green-700 dark:text-green-400 hover:underline">
          Create a campaign
        </Link>
      </section>
    );
  }
  const { current, previous } = funnel;
  const prevOf = (f: Funnel | null, key: "delivered" | "read" | "failed"): number | null => (f ? rate(f[key], f.sent) : null);

  return (
    <section aria-label="Campaign funnel" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Last campaign</h3>
      <Link
        data-testid="funnel-name"
        href={`/campaigns/${encodeURIComponent(current.id)}`}
        className="mt-1 block text-sm text-gray-700 dark:text-gray-200 break-words hover:underline"
      >
        {current.name}
      </Link>
      <ul className="mt-3 space-y-3">
        {STAGES.map((s) => {
          const value = current[s.key];
          const r = s.key === "sent" ? (current.sent > 0 ? 100 : null) : rate(value, current.sent);
          const prev = s.key === "sent" ? null : prevOf(previous, s.key);
          return (
            <li key={s.key} data-testid={`funnel-${s.key}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                <span>{s.label}</span>
                <span className="tabular-nums">
                  {value} ({pct(r)})
                  {previous && s.key !== "sent" && (
                    <span className="ml-2 text-gray-400 dark:text-gray-500">prev {pct(prev)}</span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${r ?? 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
