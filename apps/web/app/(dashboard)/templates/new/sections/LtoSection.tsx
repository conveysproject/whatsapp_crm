"use client";
import type { JSX } from "react";
import type { TemplateFormState } from "../templateFormTypes";
import { LIMITS } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

export function LtoSection({ state, onChange }: Props): JSX.Element | null {
  if (state.subType !== 'lto') return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-amber-800">Limited-Time Offer</span>
        <span className="text-xs text-amber-600">Marketing only — no footer, header must be IMAGE or VIDEO</span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-amber-800">Offer details text <span className="text-red-500">*</span></label>
        <input
          value={state.ltoText}
          onChange={(e) => onChange({ ltoText: e.target.value })}
          maxLength={LIMITS.ltoText}
          placeholder="e.g. Expiring offer!"
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-xs text-amber-700 text-right">{state.ltoText.length}/{LIMITS.ltoText}</p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={state.ltoHasExpiration}
          onChange={(e) => onChange({ ltoHasExpiration: e.target.checked })}
          className="rounded"
        />
        <span className="text-sm text-amber-800">Show expiration countdown timer in message</span>
      </label>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-amber-800">Example offer code <span className="text-red-500">*</span></label>
        <input
          value={state.couponExampleCode}
          onChange={(e) => onChange({ couponExampleCode: e.target.value })}
          maxLength={15}
          placeholder="e.g. SAVE25 (max 15 chars for LTO)"
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <p className="text-xs text-amber-600">This code appears in the Copy Code button. The actual code is provided at send time.</p>
      </div>
    </div>
  );
}
