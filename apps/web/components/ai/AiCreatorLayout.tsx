"use client";

import { JSX, ReactNode } from "react";
import Link from "next/link";

interface AiCreatorLayoutProps {
  title: string;
  backHref: string;
  preview: ReactNode;
  children: ReactNode;
}

export function AiCreatorLayout({ title, backHref, preview, children }: AiCreatorLayoutProps): JSX.Element {
  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
        <h1 className="text-base font-semibold text-gray-900">{title}</h1>
        <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-brand-100 text-brand-700 rounded-full">AI</span>
      </div>

      {/* Split body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: chat */}
        <div className="w-[40%] border-r border-gray-200 flex flex-col min-h-0">
          {children}
        </div>

        {/* Right: preview */}
        <div className="w-[60%] flex flex-col min-h-0 bg-gray-50">
          {preview}
        </div>
      </div>
    </div>
  );
}
