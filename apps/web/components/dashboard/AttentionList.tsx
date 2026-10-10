import type { JSX } from "react";
import Link from "next/link";
import type { AttentionItem } from "@/lib/dashboard";
import { useOnboardingStatusOptional } from "@/app/(dashboard)/onboarding-context";

const WHATSAPP_KEY = "whatsapp_disconnected";

/** Critical banner shown above everything when WhatsApp is disconnected. */
export function DisconnectedBanner({ items }: { items: AttentionItem[] }): JSX.Element | null {
  const onboarding = useOnboardingStatusOptional();
  const item = items.find((i) => i.key === WHATSAPP_KEY && i.severity === "critical");
  if (!item) return null;
  // Setup unfinished: the actionable step is the checklist, not the settings page.
  const setupPending = onboarding !== null && !onboarding.allDone;
  return (
    <Link
      data-testid="whatsapp-banner"
      href={setupPending ? "/checklist" : item.href}
      className="block rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300 break-words"
    >
      {setupPending ? (
        <>
          Finish setting up WhatsApp to unlock Inbox and Campaigns.{" "}
          <span className="underline underline-offset-2">Complete setup</span>
        </>
      ) : (
        <>{item.label}. Open settings to reconnect.</>
      )}
    </Link>
  );
}

export function AttentionList({ items }: { items: AttentionItem[] }): JSX.Element | null {
  const listed = items
    .filter((i) => i.key !== WHATSAPP_KEY)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));

  if (listed.length === 0) {
    // The banner already covers the disconnected case; do not claim "all clear" next to it.
    if (items.length > 0) return null;
    return (
      <section aria-label="Needs attention" className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 px-4 py-3 text-sm text-green-800 dark:text-green-300">
        <span data-testid="attention-clear">All clear. Nothing needs your attention right now.</span>
      </section>
    );
  }

  return (
    <section aria-label="Needs attention" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
        Needs attention
      </h2>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {listed.map((item) => (
          <li key={item.key}>
            <Link
              data-testid="attention-item"
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.severity === "critical"
                    ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                    : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                }`}
              >
                {item.severity === "critical" ? "Critical" : "Warning"}
              </span>
              <span className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-100 break-words">{item.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{item.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
