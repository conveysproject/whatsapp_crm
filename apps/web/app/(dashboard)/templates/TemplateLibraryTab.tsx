"use client";

import { JSX } from "react";
import { useRouter } from "next/navigation";
import {
  TEMPLATE_LIBRARY,
  DISPLAY_CATEGORY_ORDER,
  LIBRARY_DISPLAY_LABELS,
  groupByCategory,
  type LibraryTemplate,
} from "@/data/template-library";

function TemplateCard({ template }: { template: LibraryTemplate }): JSX.Element {
  const router = useRouter();

  function handleUse() {
    router.push(`/templates/new?lib=${template.id}`);
  }

  const bodyPreview = template.body.length > 180
    ? template.body.slice(0, 180).trimEnd() + "…"
    : template.body;

  return (
    <div className="group relative bg-[#f0f7f2] rounded-xl border border-gray-200 overflow-hidden flex flex-col min-h-[200px]">
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
        <button
          type="button"
          onClick={handleUse}
          className="bg-white text-gray-900 text-sm font-semibold px-5 py-2 rounded-lg shadow hover:bg-gray-50 transition-colors"
        >
          Use this template
        </button>
      </div>

      {/* Body */}
      <div className="p-3 flex-1">
        <p className="text-sm font-semibold text-gray-900 mb-1.5">{template.title}</p>
        <p className="text-[13px] text-gray-700 whitespace-pre-line leading-relaxed">{bodyPreview}</p>
        {template.buttons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-300/60 pt-2">
            {template.buttons.map((btn) => (
              <span
                key={btn.text}
                className="text-xs text-[#0a8f5c] font-medium border border-gray-300 rounded px-2 py-0.5 bg-white"
              >
                {btn.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer — template name */}
      <div className="px-3 py-2 bg-gray-100 border-t border-gray-200">
        <p className="text-[11px] text-gray-500 truncate font-mono">{template.name}</p>
      </div>
    </div>
  );
}

export function TemplateLibraryTab(): JSX.Element {
  const groups = groupByCategory(TEMPLATE_LIBRARY);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-5 min-w-max">
        {DISPLAY_CATEGORY_ORDER.map((cat) => {
          const templates = groups[cat];
          if (templates.length === 0) return null;
          return (
            <div key={cat} className="w-64 shrink-0">
              {/* Category header */}
              <div className="flex items-center gap-2 mb-3 h-10">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {LIBRARY_DISPLAY_LABELS[cat]}
                </span>
                <span className="text-xs text-gray-400">
                  {templates.length} {templates.length === 1 ? "template" : "templates"}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {templates.map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
