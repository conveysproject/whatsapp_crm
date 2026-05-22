import { JSX, ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminSignOutButton } from "./_components/admin-sign-out";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

async function getAdminUser(token: string): Promise<AdminUser | null> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/super-admins/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: AdminUser };
    return json.data;
  } catch {
    return null;
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const { getToken } = await auth();
  const token = await getToken();

  if (!token) {
    redirect("/admin/sign-in");
  }

  const user = await getAdminUser(token);

  // Server-side role enforcement — any non-superAdmin is ejected here,
  // before any admin page content or data is rendered.
  if (!user || user.role !== "superAdmin") {
    redirect("/admin/sign-in?error=unauthorized");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-sm tracking-wide text-red-400 uppercase">WBMSG Platform Admin</span>
          <Link href="/admin/organizations" className="text-sm text-gray-300 hover:text-white">Organizations</Link>
          <Link href="/admin/super-admins" className="text-sm text-gray-300 hover:text-white">Super Admins</Link>
          <Link href="/admin/platform-config" className="text-sm text-gray-300 hover:text-white">Platform Config</Link>
          <Link href="/admin/audit-logs" className="text-sm text-gray-300 hover:text-white">Audit Logs</Link>
        </div>
        <AdminSignOutButton email={user.email} />
      </nav>
      <main>{children}</main>
    </div>
  );
}
