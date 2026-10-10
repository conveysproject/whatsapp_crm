import { JSX, Suspense } from "react";
import { serverApiHeaders } from "@/lib/server-api";
import { auth } from "@clerk/nextjs/server";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DashboardSkeleton } from "@/components/dashboard/DashboardStates";
import { Greeting } from "@/components/dashboard/Greeting";

interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: "superAdmin" | "admin" | "manager" | "agent" | "viewer";
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getCurrentUser(token: string): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/users/me`, {
      headers: await serverApiHeaders(token), cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: CurrentUser }).data : null;
  } catch { return null; }
}

// Dashboard v2 (docs/prd-dashboard-v2.md).
export default async function DashboardPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const currentUser = await getCurrentUser(await getToken() ?? "");
  return (
    <div className="space-y-6">
      <Greeting fullName={currentUser?.fullName ?? "there"} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardView />
      </Suspense>
    </div>
  );
}
