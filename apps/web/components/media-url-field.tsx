"use client";

import { JSX, useState } from "react";
import { MediaAssetPicker } from "@/components/media-asset-picker";

interface Props {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  filterType?: "image" | "video" | "document" | "audio";
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** URL input with a "Library" button so users pick media instead of copy-pasting links. */
export function MediaUrlField({
  value,
  onChange,
  placeholder = "https://example.com/image.jpg",
  autoFocus,
  filterType,
  className = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500",
  onKeyDown,
}: Props): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex gap-2">
      <input
        autoFocus={autoFocus}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`${className} min-w-0 flex-1`}
      />
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="shrink-0 px-3 text-xs font-medium border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50"
      >
        📁 Library
      </button>
      <MediaAssetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        filterType={filterType}
        onSelect={(asset) => onChange(asset.fileUrl)}
      />
    </div>
  );
}
