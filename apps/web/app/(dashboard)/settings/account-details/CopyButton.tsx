"use client";

import { useState, type JSX } from "react";

export function CopyButton({ value, label }: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: the text stays selectable */ }
  }

  return (
    <button
      type="button"
      onClick={() => { void copy(); }}
      aria-label={`Copy ${label}`}
      className="shrink-0 rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
