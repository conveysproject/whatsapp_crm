"use client";
import type { JSX } from "react";
import type { TemplateFormState } from "../templateFormTypes";
import { extractVariables } from "../buildComponents";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

export function VariableExamplesSection({ state, onChange }: Props): JSX.Element | null {
  if (state.category === 'authentication') return null;

  const fromHeader = state.headerType === 'text'
    ? extractVariables(state.headerText, state.parameterFormat)
    : [];
  const fromBody = extractVariables(state.bodyText, state.parameterFormat);
  const allVars = [...new Set([...fromHeader, ...fromBody])];

  if (allVars.length === 0) return null;

  function setExample(varKey: string, value: string): void {
    onChange({ variableExamples: { ...state.variableExamples, [varKey]: value } });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div>
        <p className="text-sm font-semibold text-blue-800">Variable example values</p>
        <p className="text-xs text-blue-600 mt-0.5">Required by Meta for template review. These are not shown to users.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {allVars.map((v) => (
          <div key={v} className="flex flex-col gap-1">
            <label className="text-xs font-mono text-blue-700">{v}</label>
            <input
              value={state.variableExamples[v] ?? ''}
              onChange={(e) => setExample(v, e.target.value)}
              placeholder={`Example for ${v}`}
              className="rounded border border-blue-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
