"use client";
import type { JSX } from "react";
import type { TemplateFormState, HeaderType } from "../templateFormTypes";
import { LIMITS } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

const HEADER_TYPES: { value: HeaderType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'location', label: 'Location' },
];

export function HeaderSection({ state, onChange }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-gray-700">Header <span className="text-xs text-gray-400 font-normal">optional</span></label>

      <div className="flex gap-1 flex-wrap">
        {HEADER_TYPES.map((ht) => (
          <button
            key={ht.value}
            type="button"
            onClick={() => onChange({ headerType: ht.value })}
            className={`px-3 py-1 rounded-md text-sm border transition-colors ${
              state.headerType === ht.value
                ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {ht.label}
          </button>
        ))}
      </div>

      {state.headerType === 'text' && (
        <div className="flex flex-col gap-1">
          <input
            value={state.headerText}
            onChange={(e) => onChange({ headerText: e.target.value })}
            maxLength={LIMITS.headerText}
            placeholder="Header text (max 60 chars)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-400 text-right">{state.headerText.length}/{LIMITS.headerText}</p>
        </div>
      )}

      {(state.headerType === 'image' || state.headerType === 'video' || state.headerType === 'document') && (
        <div className="flex flex-col gap-1">
          <input
            value={state.headerMediaUrl}
            onChange={(e) => onChange({ headerMediaUrl: e.target.value })}
            placeholder={`${state.headerType.charAt(0).toUpperCase() + state.headerType.slice(1)} URL (used as example for Meta review)`}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-400">This URL is used as the example media during Meta template review. Actual media is provided at send time.</p>
        </div>
      )}

      {state.headerType === 'location' && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Location header — coordinates are provided at send time, not during template creation.
        </p>
      )}
    </div>
  );
}
