import type { ChangeEvent, JSX } from "react";
import type { SlotDef } from "@/lib/brand-settings";

interface Props {
  def: SlotDef;
  /** The current image URL exactly as the API returned it. Nothing typed by the user is ever used here. */
  url: string | null;
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}

/** One image slot: preview, Upload and Remove. The API checks size and the real file type again. */
export function BrandImageSlot({ def, url, busy, error, onFile, onRemove }: Props): JSX.Element {
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  }
  return (
    <div data-slot={def.slot} className="rounded-lg border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{def.label}</p>
        <p className="text-xs text-gray-500">{def.hint}. PNG, JPEG or WebP{def.favicon ? " or ICO" : ""}, up to {def.maxLabel}.</p>
      </div>
      <div className={`flex h-20 items-center justify-center rounded border border-dashed ${def.dark ? "bg-gray-800" : "bg-gray-50"}`}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${def.label} preview`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-gray-400">No image</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className={`inline-flex cursor-pointer items-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Uploading..." : url ? "Replace" : "Upload"}
          <input type="file" accept={def.accept} disabled={busy} onChange={onChange} className="sr-only" aria-label={`Upload ${def.label}`} />
        </label>
        {url && (
          <button type="button" onClick={onRemove} disabled={busy} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
            Remove
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
