"use client";
import type { JSX } from "react";
import type { TemplateFormState, TemplateCategory, SubType } from "../templateFormTypes";
import { LANGUAGES } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

const CATEGORIES: { value: TemplateCategory; label: string; description: string }[] = [
  { value: 'marketing', label: 'Marketing', description: 'Promotions, offers, announcements' },
  { value: 'utility', label: 'Utility', description: 'Order updates, account alerts, transactional' },
  { value: 'authentication', label: 'Authentication', description: 'OTPs and verification codes' },
];

const SUB_TYPES: { value: SubType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'coupon', label: 'Coupon Code' },
  { value: 'lto', label: 'Limited-Time Offer' },
  { value: 'carousel', label: 'Carousel' },
];

export function BasicSection({ state, onChange }: Props): JSX.Element {
  const nameError = state.name && !/^[a-z0-9_]+$/.test(state.name)
    ? 'Lowercase letters, numbers, and underscores only'
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Template name <span className="text-red-500">*</span></label>
        <input
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          placeholder="e.g. order_confirmation"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {nameError && <p className="text-xs text-red-500">{nameError}</p>}
        <p className="text-xs text-gray-400">Lowercase, letters, numbers, underscores. Max 512 chars.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Category <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => onChange({ category: cat.value, subType: 'standard' })}
              className={`flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors ${
                state.category === cat.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <span className="text-sm font-medium">{cat.label}</span>
              <span className="text-xs text-gray-500">{cat.description}</span>
            </button>
          ))}
        </div>
      </div>

      {state.category === 'marketing' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Template type</label>
          <div className="flex gap-2 flex-wrap">
            {SUB_TYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => onChange({ subType: st.value })}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  state.subType === st.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Language <span className="text-red-500">*</span></label>
          <select
            value={state.language}
            onChange={(e) => onChange({ language: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
            ))}
          </select>
        </div>
        {state.category !== 'authentication' && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Variable format</label>
            <select
              value={state.parameterFormat}
              onChange={(e) => onChange({ parameterFormat: e.target.value as 'positional' | 'named' })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="positional">Positional — {'{{1}}'}, {'{{2}}'}</option>
              <option value="named">Named — {'{{first_name}}'}</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
