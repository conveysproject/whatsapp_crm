"use client";

import { JSX, useState } from "react";

const SWATCHES = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#10B981", // emerald
  "#14B8A6", // teal
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#EF4444", // red
  "#FACC15", // yellow
  "#64748B", // slate
] as const;

const NAME_RE = /[^a-zA-Z0-9 \-_]/;

export interface StatusDraft {
  id?: string;
  name: string;
  color: string;
}

export default function StatusSlideOver({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: StatusDraft | null;
  saving: boolean;
  onSave: (draft: { name: string; color: string }) => void;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? SWATCHES[0]);
  const [nameError, setNameError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{initial?.id ? "Edit Status" : "Add Status"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Status Name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(NAME_RE.test(e.target.value) ? "Only letters, numbers, spaces, hyphens, and underscores." : null);
              }}
              placeholder="Enter status name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Select Colour</label>
            <div className="grid grid-cols-5 gap-3">
              {SWATCHES.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  onClick={() => setColor(sw)}
                  aria-label={`Select colour ${sw}`}
                  className={["w-8 h-8 rounded-full transition-transform", color === sw ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""].join(" ")}
                  style={{ backgroundColor: sw }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onSave({ name: name.trim(), color })}
            disabled={saving || !name.trim() || !!nameError}
            className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
