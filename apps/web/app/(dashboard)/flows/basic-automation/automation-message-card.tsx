"use client";

import { JSX, useRef } from "react";

const VARIABLES = [
  { label: "{{first_name}}", insert: "{{first_name}}" },
  { label: "{{last_name}}", insert: "{{last_name}}" },
  { label: "{{full_name}}", insert: "{{full_name}}" },
  { label: "{{phone}}", insert: "{{phone}}" },
];

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

export function MessageTextArea({ label, value, onChange, placeholder, rows = 4 }: Props): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map((v) => (
          <button
            key={v.insert}
            type="button"
            onClick={() => insertAtCursor(v.insert)}
            className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded px-2 py-0.5 font-mono"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** WhatsApp-style message bubble preview */
export function WaBubblePreview({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="bg-green-100 text-gray-800 rounded-lg rounded-tr-none px-3 py-2 max-w-xs text-sm whitespace-pre-wrap shadow-sm">
        {text || <span className="text-gray-400 italic">Your message preview will appear here</span>}
      </div>
    </div>
  );
}
