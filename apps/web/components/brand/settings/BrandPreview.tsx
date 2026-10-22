"use client";

import type { CSSProperties, JSX } from "react";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { brandPreviewStyle } from "@/lib/brand-settings";
import type { Brand } from "@/lib/brand";

/**
 * A small mock of the app in the brand being edited. The colors are CSS variables set as an inline style on this
 * container only, so the real page (and :root) keep the current brand.
 */
export function BrandPreview({ brand }: { brand: Brand }): JSX.Element {
  const style = brandPreviewStyle(brand) as CSSProperties;
  return (
    <BrandProvider brand={brand}>
      <div data-testid="brand-preview" style={style} className="overflow-hidden rounded-lg border bg-white">
        <div className="flex">
          <div className="w-40 shrink-0 space-y-3 border-r bg-gray-50 p-3">
            <div className="flex h-8 items-center"><BrandLogo height={28} /></div>
            <nav className="space-y-1 text-xs">
              <div className="rounded bg-brand-100 px-2 py-1.5 font-medium text-brand-800">Inbox</div>
              <div className="px-2 py-1.5 text-gray-600">Contacts</div>
              <div className="px-2 py-1.5 text-gray-600">Campaigns</div>
            </nav>
          </div>
          <div className="flex-1 space-y-3 p-4">
            <p className="text-sm font-medium text-gray-900">Welcome to {brand.name}</p>
            <button type="button" tabIndex={-1} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              Send message
            </button>
            <p className="text-xs text-brand-700">A link in your brand color</p>
          </div>
        </div>
      </div>
    </BrandProvider>
  );
}
