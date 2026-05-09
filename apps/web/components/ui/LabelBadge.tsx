"use client";

import type { JSX } from "react";

export interface LabelItem {
  id: string;
  title: string;
  textColor: string | null;
  bgColor: string | null;
}

interface Props {
  label: LabelItem;
  onRemove?: (labelId: string) => void;
}

export function LabelBadge({ label, onRemove }: Props): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        color: label.textColor ?? "#ffffff",
        backgroundColor: label.bgColor ?? "#6366f1",
      }}
    >
      {label.title}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(label.id); }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          aria-label={`Remove ${label.title}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
