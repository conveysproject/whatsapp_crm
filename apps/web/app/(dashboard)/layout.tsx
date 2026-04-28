import type { JSX } from "react";
import { UserButton } from "@clerk/nextjs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-lg">TrustCRM</span>
        <UserButton />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
