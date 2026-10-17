import { JSX, ReactNode } from "react";
import { serverApiHeaders, getImpersonationCookie } from "@/lib/server-api";
import { Sidebar } from "@/components/layout/Sidebar";
import { RoleRouteGuard } from "@/components/layout/RoleRouteGuard";
import { TopBar } from "@/components/layout/TopBar";
import { SetupBanner } from "@/components/SetupBanner";
import { BillingStandingBanner } from "@/components/billing/BillingStandingBanner";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ImpersonationProvider } from "@/components/ImpersonationProvider";
import { BreadcrumbNav } from "@/components/layout/BreadcrumbNav";
import { OnboardingProvider } from "@/app/(dashboard)/onboarding-context";
import { auth } from "@/lib/auth/server";
import { authProvider } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

type OrgStatus = {
  provisioned: boolean;
  wabaConnected: boolean;
  numberProvisioned: boolean;
  orgName?: string;
};

class OrgStatusUnavailableError extends Error {}

// Only 403/404 from the API mean "this user has no organization yet". Anything else
// (5xx, 401, timeout, network) is transient: retry once, then throw so the user sees an
// error instead of being sent to /business-details when they are already registered.
async function getOrgStatus(token: string): Promise<OrgStatus> {
  let lastFailure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await fetchOrgStatus(token);
      if (result) return result;
      return { provisioned: false, wabaConnected: false, numberProvisioned: false };
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : String(err);
      console.error(`[dashboard-layout] org status attempt ${attempt} failed: ${lastFailure}`);
    }
  }
  throw new OrgStatusUnavailableError(`Could not load organization status: ${lastFailure}`);
}

// Returns null when the org definitively does not exist; throws on any transient failure.
async function fetchOrgStatus(token: string): Promise<OrgStatus | null> {
  {
    const [orgRes, statusRes] = await Promise.all([
      fetch(`${API_URL}/v1/organizations/me`, {
        headers: await serverApiHeaders(token),
        cache: "no-store",
      }),
      fetch(`${API_URL}/v1/onboarding/status`, {
        headers: await serverApiHeaders(token),
        cache: "no-store",
      }),
    ]);
    if (orgRes.status === 403 || orgRes.status === 404) return null;
    if (!orgRes.ok) throw new Error(`/organizations/me returned ${orgRes.status}`);
    const org = (await orgRes.json().catch(() => null)) as { data?: { name?: string } } | null;
    const status = statusRes.ok
      ? (await statusRes.json() as { wabaConnected: boolean; numberProvisioned: boolean })
      : { wabaConnected: false, numberProvisioned: false };
    return {
      provisioned: true,
      wabaConnected: status.wabaConnected,
      numberProvisioned: status.numberProvisioned,
      orgName: org?.data?.name,
    };
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const { getToken, orgSlug, userId } = await auth.protect();
  const token = await getToken();

  // Under impersonation the admin has no Clerk org; the API resolves the target user's org
  // from the imp_token cookie. A forged/garbage cookie is rejected by the API (401), which
  // makes getOrgStatus return provisioned=false and falls through to the redirect below,
  // so the cookie never bypasses a check on its own.
  const impersonating = (await getImpersonationCookie()) !== null;
  // orgSlug is a Clerk-only claim; in wbmsg mode the org check below (organizations/me) decides.
  if (authProvider() === "clerk" && !orgSlug && !impersonating) {
    redirect("/checklist");
  }

  const status = await getOrgStatus(token ?? "");

  if (!status.provisioned) {
    // Stale/revoked impersonation cookie: clear it instead of sending the admin to onboarding.
    if (impersonating) redirect("/api/impersonation/end");
    redirect("/business-details");
  }

  return (
    <OnboardingProvider status={status}>
      <ImpersonationProvider impersonating={impersonating} />
      <RoleRouteGuard />
      <Toaster richColors position="top-right" />
      {/* relative: hidden (sr-only) and other absolutely positioned elements are contained and clipped by this frame instead of stretching the window's own scroll height */}
      <div className="relative flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <ImpersonationBanner impersonating={impersonating} />
          <TopBar orgName={impersonating || authProvider() === "wbmsg" ? status.orgName : (orgSlug ?? undefined)} userId={userId ?? undefined} />
          <SetupBanner />
          <BillingStandingBanner />
          <main className="flex flex-col flex-1 px-4 py-4 overflow-auto min-h-0">
            {/* <BreadcrumbNav /> */}
            {children}
          </main>
        </div>
      </div>
    </OnboardingProvider>
  );
}
