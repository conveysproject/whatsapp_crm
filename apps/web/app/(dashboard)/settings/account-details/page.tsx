import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OrgData {
  id: string;
  name: string;
  createdAt: string;
  metaBusinessId: string | null;
  whatsappBusinessAccountId: string | null;
  planTier: string;
  trialEndsAt: string | null;
  status: string;
}

async function getOrg(token: string): Promise<OrgData | null> {
  try {
    const res = await fetch(`${API_URL}/v1/organizations/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json() as { data: OrgData }).data;
  } catch { return null; }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function planLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

interface RowProps { label: string; value: string }
function Row({ label, value }: RowProps): JSX.Element {
  return (
    <div className="flex items-center py-3.5 border-b border-gray-100 last:border-0">
      <span className="w-64 text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 break-all">{value}</span>
    </div>
  );
}

export default async function AccountDetailsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const org = await getOrg(token);

  if (!org) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Account Details</h1>
        <p className="text-sm text-red-500">Failed to load account details.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
        <p className="text-sm text-gray-500 mt-1">Your organization account information.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Section header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-gray-900">General Info</span>
        </div>

        <div className="px-5">
          <Row label="Creation Date" value={formatDate(org.createdAt)} />
          <Row label="Organization ID" value={org.id} />
          <Row label="Facebook Business Manager ID" value={org.metaBusinessId ?? "—"} />
          <Row label="WhatsApp Business ID" value={org.whatsappBusinessAccountId ?? "—"} />
          <Row label="Subscription Type" value={org.planTier ? planLabel(org.planTier) : "—"} />
          <Row label="Subscription Start Date" value="—" />
          <Row label="Subscription End Date" value={formatDate(org.trialEndsAt)} />
        </div>
      </div>
    </div>
  );
}
