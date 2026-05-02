import { JSX, ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SetupBanner } from "@/components/SetupBanner";
import { OnboardingProvider } from "@/app/(dashboard)/onboarding-context";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getOrgStatus(token: string): Promise<{
  provisioned: boolean;
  wabaConnected: boolean;
  numberProvisioned: boolean;
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
    if (!orgRes.ok) return { provisioned: false, wabaConnected: false, numberProvisioned: false };
    const status = statusRes.ok
      ? (await statusRes.json() as { wabaConnected: boolean; numberProvisioned: boolean })
      : { wabaConnected: false, numberProvisioned: false };
    return {
      provisioned: true,
      wabaConnected: status.wabaConnected,
      numberProvisioned: status.numberProvisioned,
    };
  } catch {
    return { provisioned: false, wabaConnected: false, numberProvisioned: false };
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const { getToken, orgSlug } = await auth.protect();
  const token = await getToken();

  if (!orgSlug) {
    redirect("/checklist");
  }

  const status = await getOrgStatus(token ?? "");

  return (
    <OnboardingProvider status={status}>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar orgName={orgSlug ?? undefined} />
          <SetupBanner />
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </OnboardingProvider>
  );
}
