"use client";
import { useRef, type JSX } from "react";
import type { TemplateFormState } from "../templateFormTypes";
import { LIMITS } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

export function BodySection({ state, onChange }: Props): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isAuth = state.category === 'authentication';
  const isLto = state.subType === 'lto';
  const maxChars = isLto ? LIMITS.ltoBodyText : LIMITS.bodyText;

  function insertVariable(): void {
    if (!ref.current) return;
    const ta = ref.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    let varText: string;
    if (state.parameterFormat === 'positional') {
      const existing = (state.bodyText.match(/\{\{(\d+)\}\}/g) ?? []);
      const maxIdx = existing.reduce((m, v) => Math.max(m, parseInt(v.slice(2, -2))), 0);
      varText = `{{${maxIdx + 1}}}`;
    } else {
      varText = '{{variable_name}}';
    }
    const next = state.bodyText.substring(0, start) + varText + state.bodyText.substring(end);
    onChange({ bodyText: next });
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varText.length, start + varText.length);
    }, 0);
  }

  if (isAuth) {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">Body</label>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600 space-y-2">
          <p><strong>{'{{1}}'}</strong> is your verification code.</p>
          {state.addSecurityRecommendation && (
            <p className="text-gray-500">For your security, do not share this code.</p>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.addSecurityRecommendation}
            onChange={(e) => onChange({ addSecurityRecommendation: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Add security recommendation</span>
        </label>
        <p className="text-xs text-gray-400">Authentication template body text is fixed by Meta. Only the verification code is variable.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Body <span className="text-red-500">*</span></label>
        <button
          type="button"
          onClick={insertVariable}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          + Insert variable
        </button>
      </div>
      <textarea
        ref={ref}
        value={state.bodyText}
        onChange={(e) => onChange({ bodyText: e.target.value })}
        rows={5}
        maxLength={maxChars}
        placeholder={`Message body. Use ${state.parameterFormat === 'positional' ? '{{1}}, {{2}}' : '{{first_name}}'} for variables.`}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
      />
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">
          Supports *bold*, _italic_, ~strikethrough~, ```code```
        </p>
        <p className={`text-xs ${state.bodyText.length > maxChars * 0.9 ? 'text-amber-500' : 'text-gray-400'}`}>
          {state.bodyText.length}/{maxChars}
        </p>
      </div>
    </div>
  );
}
