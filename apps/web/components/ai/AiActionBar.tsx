"use client";

import { JSX } from "react";

interface AiActionBarProps {
  onPrimary: () => void;
  primaryLabel: string;
  onRefine: () => void;
  onEdit: () => void;
  editLabel?: string;
  disabled?: boolean;
}

export function AiActionBar({
  onPrimary,
  primaryLabel,
  onRefine,
  onEdit,
  editLabel = "Edit Manually",
  disabled = false,
}: AiActionBarProps): JSX.Element {
  return (
    <div className="border-t border-gray-200 bg-white p-3 flex gap-2 justify-end">
      <button
        onClick={onEdit}
        disabled={disabled}
        className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {editLabel}
      </button>
      <button
        onClick={onRefine}
        disabled={disabled}
        className="px-4 py-2 text-sm font-medium border border-brand-300 rounded-lg text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Refine with AI
      </button>
      <button
        onClick={onPrimary}
        disabled={disabled}
        className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {primaryLabel}
      </button>
    </div>
  );
}
