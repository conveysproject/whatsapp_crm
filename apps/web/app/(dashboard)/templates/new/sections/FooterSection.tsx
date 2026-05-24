"use client";
import type { JSX } from "react";
import type { TemplateFormState } from "../templateFormTypes";
import { LIMITS } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

export function FooterSection({ state, onChange }: Props): JSX.Element | null {
  if (state.subType === 'lto') return null;

  if (state.category === 'authentication') {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">
          Code expiration <span className="text-xs text-gray-400 font-normal">optional</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={LIMITS.codeExpiration.min}
            max={LIMITS.codeExpiration.max}
            value={state.codeExpirationMinutes}
            onChange={(e) => onChange({ codeExpirationMinutes: e.target.value })}
            placeholder="e.g. 10"
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-500">minutes (1–90)</span>
        </div>
        <p className="text-xs text-gray-400">
          When set, the message shows: &ldquo;This code expires in N minutes.&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        Footer <span className="text-xs text-gray-400 font-normal">optional</span>
      </label>
      <input
        value={state.footerText}
        onChange={(e) => onChange({ footerText: e.target.value })}
        maxLength={LIMITS.footerText}
        placeholder="Footer text (max 60 chars)"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <p className="text-xs text-gray-400 text-right">{state.footerText.length}/{LIMITS.footerText}</p>
    </div>
  );
}
