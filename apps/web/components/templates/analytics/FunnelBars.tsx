import type { JSX } from "react";
import { dropOffPercent, formatCount, formatRate, type TemplateAnalytics } from "@/lib/template-analytics";

export function FunnelBars({ data }: { data: TemplateAnalytics }): JSX.Element {
  const steps = [
    { key: "sent", label: "Sent", value: data.sent, color: "bg-blue-500", drop: null as number | null },
    { key: "delivered", label: "Delivered", value: data.delivered, color: "bg-green-500", drop: dropOffPercent(data.sent, data.delivered) },
    { key: "read", label: "Read", value: data.read, color: "bg-purple-500", drop: dropOffPercent(data.delivered, data.read) },
  ];
  const max = Math.max(data.sent, data.delivered, data.read, 0);
  return (
    <section aria-labelledby="funnel-heading" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 id="funnel-heading" className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">Delivery funnel</h2>
      <ul className="space-y-3" data-testid="funnel">
        {steps.map((s) => (
          <li key={s.key} data-testid={`funnel-${s.key}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm text-gray-700 dark:text-gray-200">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {formatCount(s.value)}
                {s.drop !== null && (
                  <span data-testid={`funnel-drop-${s.key}`} className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    {formatRate(s.drop)} drop-off
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-3 w-full rounded-full bg-gray-100 dark:bg-gray-700" role="presentation">
              <div className={`h-3 rounded-full ${s.color}`} style={{ width: max > 0 ? `${(s.value / max) * 100}%` : "0%" }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
