import type { JSX } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { loadSessionBrand } from "@/lib/brand-session";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }): Promise<JSX.Element> {
  const brand = await loadSessionBrand();
  return (
    <BrandProvider brand={brand}>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-2xl px-8 py-6">
          <div className="mb-6 text-center">
            <BrandLogo height={40} />
          </div>
          {children}
        </div>
      </div>
    </BrandProvider>
  );
}
