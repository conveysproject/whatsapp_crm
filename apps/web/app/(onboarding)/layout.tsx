import type { JSX } from "react";
import Image from "next/image";

export default function OnboardingLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        <div className="mb-6 text-center">
          <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "40px", width: "auto" }} />
        </div>
        {children}
      </div>
    </div>
  );
}
