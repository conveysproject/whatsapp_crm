import { JSX } from "react";

interface TemplatePreviewProps {
  header?: string;
  body: string;
  footer?: string;
}

export function TemplatePreview({ header, body, footer }: TemplatePreviewProps): JSX.Element {
  return (
    <div className="bg-[#e5ddd5] rounded-xl p-4 max-w-xs">
      <div className="bg-white rounded-lg p-3 shadow-card space-y-1">
        {header && <p className="text-sm font-semibold text-gray-900">{header}</p>}
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {body || <span className="text-gray-400">Message body…</span>}
        </p>
        {footer && <p className="text-xs text-gray-400 mt-1">{footer}</p>}
        <p className="text-xs text-gray-400 text-right">12:00 PM ✓✓</p>
      </div>
    </div>
  );
}
