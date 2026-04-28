import type { JSX } from "react";

export default function OnboardingLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">TrustCRM Setup</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
