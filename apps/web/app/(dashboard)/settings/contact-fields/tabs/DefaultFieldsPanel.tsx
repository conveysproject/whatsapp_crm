"use client";

import { JSX, useRef, useState } from "react";
import { DEFAULT_FIELDS } from "./defaultFields";

function CopyKey({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function copy() {
    void navigator.clipboard.writeText(value);
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-mono"
      title="Copy API keyname"
    >
      {value}
      <span className="text-[10px]">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

export default function DefaultFieldsPanel(): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Default Fields</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
        <span>Field Label</span>
        <span>Type</span>
      </div>
      <div className="divide-y divide-gray-50">
        {DEFAULT_FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3 items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{f.label}</p>
              <CopyKey value={f.key} />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{f.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
