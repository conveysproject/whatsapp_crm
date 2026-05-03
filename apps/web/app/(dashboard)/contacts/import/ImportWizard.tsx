"use client";

import { JSX, createContext, useContext, useState } from "react";
import type { FieldMapping, ImportAnalysisResult, ImportProgress } from "@WBMSG/shared";
import { Step1Upload } from "./steps/Step1Upload";
import { Step2MapFields } from "./steps/Step2MapFields";
import { Step3Preview } from "./steps/Step3Preview";
import { Step4Progress } from "./steps/Step4Progress";
import { Step5Summary } from "./steps/Step5Summary";

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  sessionId: string | null;
  columns: string[];
  sampleRows: Record<string, string>[];
  mapping: FieldMapping;
  batchTags: string[];
  lifecycleStage: string;
  analysisResult: ImportAnalysisResult | null;
  updateExisting: boolean;
  importJobId: string | null;
  importToken: string | null;
  totalRows: number;
  importSummary: ImportProgress | null;
}

interface WizardContextValue {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside ImportWizard");
  return ctx;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  sessionId: null,
  columns: [],
  sampleRows: [],
  mapping: [],
  batchTags: [],
  lifecycleStage: "lead",
  analysisResult: null,
  updateExisting: true,
  importJobId: null,
  importToken: null,
  totalRows: 0,
  importSummary: null,
};

const STEP_LABELS = ["Upload", "Map Fields", "Preview", "Importing", "Done"] as const;

export function ImportWizard(): JSX.Element {
  const [state, setStateRaw] = useState<WizardState>(INITIAL_STATE);

  function setState(patch: Partial<WizardState>) {
    setStateRaw((prev) => ({ ...prev, ...patch }));
  }

  function nextStep() {
    setStateRaw((prev) => ({ ...prev, step: Math.min(prev.step + 1, 5) as WizardState["step"] }));
  }

  function prevStep() {
    setStateRaw((prev) => ({ ...prev, step: Math.max(prev.step - 1, 1) as WizardState["step"] }));
  }

  function reset() {
    setStateRaw(INITIAL_STATE);
  }

  const stepComponents: Record<WizardState["step"], JSX.Element> = {
    1: <Step1Upload />,
    2: <Step2MapFields />,
    3: <Step3Preview />,
    4: <Step4Progress />,
    5: <Step5Summary />,
  };

  return (
    <WizardContext.Provider value={{ state, setState, nextStep, prevStep, reset }}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import Contacts</h1>
          <nav className="mt-4 flex items-center gap-0 flex-wrap">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = (idx + 1) as WizardState["step"];
              const isActive = state.step === stepNum;
              const isDone = state.step > stepNum;
              return (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full ${isActive ? "bg-brand-600 text-white font-medium" : isDone ? "text-brand-600" : "text-gray-400"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-white text-brand-600" : isDone ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {isDone ? "✓" : stepNum}
                    </span>
                    {label}
                  </div>
                  {idx < STEP_LABELS.length - 1 && <div className="w-6 h-px bg-gray-200 mx-1" />}
                </div>
              );
            })}
          </nav>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {stepComponents[state.step]}
        </div>
      </div>
    </WizardContext.Provider>
  );
}
