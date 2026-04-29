import { JSX, ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

async function isUserProvisioned(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/organizations/me`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const { getToken, orgSlug } = await auth.protect();
  const token = await getToken();

  // If user has no org in Clerk yet, send to onboarding
  if (!orgSlug) {
    redirect("/checklist");
  }

  // If user exists in Clerk org but not yet in our DB (webhook delay), send to onboarding
  const provisioned = await isUserProvisioned(token ?? "");
  if (!provisioned) {
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
