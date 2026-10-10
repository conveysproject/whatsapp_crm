import type { JSX, ReactNode } from "react";
import Link from "next/link";
import type { DashboardData, Kpi } from "@/lib/dashboard";
import { formatDelta, formatDuration } from "@/lib/format";

const FIRST_REPLY_NOTE = "Time from the first customer message to the first reply. Bot replies are included.";

function Delta({ pct, lowerIsBetter = false }: { pct: number | null; lowerIsBetter?: boolean }): JSX.Element {
  const d = formatDelta(pct);
  if (d.up === null) {
    return <span data-testid="kpi-delta" className="text-xs text-gray-400 dark:text-gray-500">{d.text}</span>;
  }
  return (
    <span
      data-testid="kpi-delta"
      data-direction={d.up ? "up" : "down"}
      className={`text-xs font-medium ${d.up !== lowerIsBetter ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
    >
      {d.up ? "▲" : "▼"} {d.text}
    </span>
  );
}

interface CardProps {
  id: string;
  label: string;
  href: string;
  value: string;
  delta?: number | null;
  hasDelta: boolean;
  lowerIsBetter?: boolean;
  sub?: string;
  note?: string;
  info?: ReactNode;
}

function Card({ id, label, href, value, delta, hasDelta, lowerIsBetter, sub, note, info }: CardProps): JSX.Element {
  return (
    <Link
      data-testid={`kpi-${id}`}
      href={href}
      className="block min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm hover:border-green-300 dark:hover:border-green-700"
    >
      <p className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <span className="min-w-0 break-words">{label}</span>
        {info}
      </p>
      {note && <p data-testid="kpi-note" className="text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      <p data-testid="kpi-value" className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
        {hasDelta && <Delta pct={delta ?? null} lowerIsBetter={lowerIsBetter} />}
        {sub && <span>{sub}</span>}
      </div>
    </Link>
  );
}

function count(k: Kpi): string {
  return String(k.value ?? 0);
}

export function KpiGrid({ kpis }: { kpis: DashboardData["kpis"] }): JSX.Element {
  return (
    <section aria-label="Key metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card id="open" label="Open conversations" href="/inbox" value={String(kpis.openConversations.value)} hasDelta={false} />
      <Card id="new-conversations" label="New conversations" href="/inbox" value={count(kpis.newConversations)} delta={kpis.newConversations.deltaPct} hasDelta />
      <Card id="new-contacts" label="New contacts" href="/contacts" value={count(kpis.newContacts)} delta={kpis.newContacts.deltaPct} hasDelta />
      <Card
        id="messages"
        label="Messages"
        href="/messages"
        value={count(kpis.messages)}
        delta={kpis.messages.deltaPct}
        hasDelta
        sub={`${kpis.messages.inbound} in / ${kpis.messages.outbound} out`}
      />
      <Card
        id="first-reply"
        label="Avg time to first reply"
        href="/analytics"
        value={formatDuration(kpis.firstReplySecs.value)}
        delta={kpis.firstReplySecs.deltaPct}
        hasDelta
        lowerIsBetter
        note="Bot replies are included."
        info={
          <span
            data-testid="first-reply-info"
            role="img"
            tabIndex={0}
            title={FIRST_REPLY_NOTE}
            aria-label={FIRST_REPLY_NOTE}
            className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 text-[10px] text-gray-500 dark:text-gray-400"
          >
            i
          </span>
        }
      />
      <Card id="campaigns" label="Campaigns sent" href="/campaigns" value={count(kpis.campaignsSent)} delta={kpis.campaignsSent.deltaPct} hasDelta />
    </section>
  );
}
