import type { JSX } from "react";
import type { DashRange } from "@/lib/dashboard";

const OPTIONS: ReadonlyArray<{ value: DashRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export function RangePicker({ value, onChange }: { value: DashRange; onChange: (r: DashRange) => void }): JSX.Element {
  return (
    <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-green-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
