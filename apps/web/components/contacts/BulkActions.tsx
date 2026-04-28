"use client";

import { JSX } from "react";
import { Button } from "@/components/ui/Button";

interface BulkActionsProps {
  selectedIds: string[];
  onDelete: (ids: string[]) => void;
  onClearSelection: () => void;
}

export function BulkActions({ selectedIds, onDelete, onClearSelection }: BulkActionsProps): JSX.Element | null {
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2">
      <span className="text-sm font-medium text-brand-700">
        {selectedIds.length} selected
      </span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => onDelete(selectedIds)}
      >
        Delete
      </Button>
      <button
        type="button"
        onClick={onClearSelection}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Clear
      </button>
    </div>
  );
}
