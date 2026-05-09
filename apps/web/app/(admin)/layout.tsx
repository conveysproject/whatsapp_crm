import { JSX, ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center gap-4">
        <span className="font-bold text-sm">TrustCRM Admin</span>
        <a href="/admin/organizations" className="text-sm text-gray-600 hover:text-gray-900">Organizations</a>
        <a href="/admin/platform-config" className="text-sm text-gray-600 hover:text-gray-900">Platform Config</a>
      </nav>
      <main>{children}</main>
    </div>
  );
}
