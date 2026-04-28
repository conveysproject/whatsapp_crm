import { JSX, ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { auth, currentUser } from "@clerk/nextjs/server";

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  await auth.protect();
  const user = await currentUser();
  const orgName = user?.organizationMemberships?.[0]?.organization?.name;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar orgName={orgName} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
