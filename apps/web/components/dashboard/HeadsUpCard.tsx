import type { JSX } from "react";
import Link from "next/link";
import { alertDateLabel, alertText, type MessageUsage } from "@/lib/message-usage";

/**
 * Amber "Heads-up" card next to the usage card: the latest usage alerts of this billing period, each with its date,
 * and a link to see what was counted. Renders nothing when there is nothing to say.
 */
export function HeadsUpCard({ usage }: { usage: MessageUsage }): JSX.Element | null {
  const lines = [...usage.alerts]
    .reverse()
    .map((a) => ({ key: a.kind, text: alertText(a.kind, usage.plan), date: alertDateLabel(a.at) }))
    .filter((l): l is { key: string; text: string; date: string } => l.text !== null)
    .slice(0, 3);
  if (lines.length === 0) return null;
  return (
    <section data-testid="message-usage-heads-up" className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950">
      <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">Heads-up</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-amber-900 dark:text-amber-100">
        {lines.map((l) => (
          <li key={l.key}>{l.text}{l.date ? ` (${l.date})` : ""}</li>
        ))}
      </ul>
      <Link href="/settings/billing" className="mt-3 inline-block text-sm font-medium text-brand-800 underline underline-offset-2 dark:text-brand-400">
        See what was counted
      </Link>
    </section>
  );
}
