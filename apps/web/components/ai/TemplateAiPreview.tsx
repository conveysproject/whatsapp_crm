"use client";

import { JSX } from "react";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { buildComponents } from "@/app/(dashboard)/templates/new/buildComponents";
import type { TemplateFormState } from "@/app/(dashboard)/templates/new/templateFormTypes";

interface TemplateAiPreviewProps {
  templateState: TemplateFormState | null;
  imageUrl: string;
  imageLoading: boolean;
}

export function TemplateAiPreview({ templateState, imageUrl, imageLoading }: TemplateAiPreviewProps): JSX.Element {
  if (!templateState) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-8">
          Describe your template in the chat and AI will generate a preview here.
        </p>
      </div>
    );
  }

  // Inject the R2 image URL into the state before building components
  const stateWithImage: TemplateFormState = imageUrl
    ? { ...templateState, headerMediaUrl: imageUrl }
    : templateState;

  const components = buildComponents(stateWithImage);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-sm mx-auto">
        <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wide">Preview</p>

        {/* Image skeleton while generating */}
        {templateState.headerType === "image" && imageLoading && (
          <div className="w-full h-40 bg-gray-200 rounded-xl mb-3 animate-pulse flex items-center justify-center">
            <span className="text-xs text-gray-400">Generating image…</span>
          </div>
        )}

        <div className="bg-[#e5ddd5] rounded-2xl p-4">
          <TemplatePreview components={components} templateName={templateState.name} />
        </div>

        {templateState.name && (
          <p className="text-xs text-gray-400 text-center mt-3">
            Template: <span className="font-mono">{templateState.name}</span> · {templateState.category} · {templateState.language}
          </p>
        )}
      </div>
    </div>
  );
}
