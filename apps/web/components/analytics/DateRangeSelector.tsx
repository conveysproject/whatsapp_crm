"use client";

import { JSX } from "react";

const PRESETS = [7, 14, 30, 90] as const;

interface DateRangeSelectorProps {
  days: number;
  onChange: (days: number) => void;
}

export function DateRangeSelector({ days, onChange }: DateRangeSelectorProps): JSX.Element {
  return (
    <div className="flex gap-1">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => { onChange(p); }}
          className={[
            "px-3 py-1 text-xs font-medium rounded-full transition-colors",
            days === p
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          ].join(" ")}
        >
          {p}d
        </button>
      ))}
    </div>
  );
}
