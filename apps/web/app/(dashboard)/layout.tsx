import { JSX, ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getOrgStatus(token: string): Promise<{
  provisioned: boolean;
  wabaConnected: boolean;
}> {
  try {
    const [orgRes, statusRes] = await Promise.all([
      fetch(`${API_URL}/v1/organizations/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch(`${API_URL}/v1/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);
    if (!orgRes.ok) return { provisioned: false, wabaConnected: false };
    const status = statusRes.ok
      ? (await statusRes.json() as { wabaConnected: boolean })
      : { wabaConnected: false };
    return { provisioned: true, wabaConnected: status.wabaConnected };
  } catch {
    return { provisioned: false, wabaConnected: false };
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const { getToken, orgSlug } = await auth.protect();
  const token = await getToken();

  if (!orgSlug) {
    redirect("/checklist");
  }

  const { provisioned, wabaConnected } = await getOrgStatus(token ?? "");

  if (!provisioned) {
    redirect("/checklist");
  }

  if (!wabaConnected) {
    redirect("/checklist");
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar orgName={orgSlug ?? undefined} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
