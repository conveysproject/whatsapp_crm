"use client";

import { JSX, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OrgDetail {
  id: string;
  name: string;
  status: string;
  planTier: string;
  createdAt: string;
  _count: { members: number; conversations: number };
  usage: { contacts: number; messages: number; campaigns: number };
}

const PLAN_TIERS = ["starter", "growth", "scale", "enterprise"] as const;

function useAdminFetch() {
  const { getToken } = useAuth();
  return async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? ""}`,
        ...init?.headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  };
}

export default function AdminOrgDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const adminFetch = useAdminFetch();
  const [planTier, setPlanTier] = useState<string | null>(null);

  const { data: org, isLoading, refetch } = useQuery<OrgDetail>({
    queryKey: ["admin-org", id],
    queryFn: () =>
      adminFetch<{ data: OrgDetail }>(`/v1/admin/organizations/${id}`).then((j) => j.data),
  });

  const updatePlan = useMutation({
    mutationFn: (tier: string) =>
      adminFetch(`/v1/admin/organizations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ planTier: tier }),
      }),
    onSuccess: () => { void refetch(); },
  });

  const ban = useMutation({
    mutationFn: (reason: string) =>
      adminFetch(`/v1/admin/organizations/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => { void refetch(); },
  });

  const unban = useMutation({
    mutationFn: () =>
      adminFetch(`/v1/admin/organizations/${id}/unban`, { method: "POST" }),
    onSuccess: () => { void refetch(); },
  });

  async function loginAs() {
    const adminFetchFn = adminFetch;
    const res = await adminFetchFn<{ data: { token: string } }>(`/v1/admin/organizations/${id}/impersonate`, { method: "POST" });
    sessionStorage.setItem("impersonation", JSON.stringify({ token: res.data.token, orgId: org?.id, orgName: org?.name }));
    window.location.href = "/dashboard";
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  if (!org) return <div className="p-6 text-sm text-red-500">Organization not found.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/organizations" className="text-sm text-gray-500 hover:text-gray-700">← Organizations</Link>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${org.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
          {org.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Members", value: org._count.members },
          { label: "Conversations", value: org._count.conversations },
          { label: "Contacts", value: org.usage.contacts },
          { label: "Messages", value: org.usage.messages },
          { label: "Campaigns", value: org.usage.campaigns },
        ].map(({ label, value }) => (
          <div key={label} className="border rounded-lg p-4">
            <p className="text-2xl font-semibold text-gray-900">{value.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Plan Management</h2>
        <p className="text-sm text-gray-600">Current: <span className="font-semibold capitalize">{org.planTier}</span></p>
        <div className="flex gap-2">
          <select
            value={planTier ?? org.planTier}
            onChange={(e) => setPlanTier(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            {PLAN_TIERS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
          <button
            onClick={() => { if (planTier) updatePlan.mutate(planTier); }}
            disabled={updatePlan.isPending || !planTier || planTier === org.planTier}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {updatePlan.isPending ? "Updating…" : "Update Plan"}
          </button>
        </div>
      </div>

      <div className="border rounded-lg p-5 space-y-3">
        <h2 className="font-medium">Actions</h2>
        <div className="flex gap-3">
          <button
            onClick={() => { void loginAs(); }}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Login As This Org
          </button>
          {org.status === "banned" ? (
            <button
              onClick={() => unban.mutate()}
              disabled={unban.isPending}
              className="px-4 py-2 text-sm border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-50"
            >
              {unban.isPending ? "Unbanning…" : "Unban"}
            </button>
          ) : (
            <button
              onClick={() => {
                const reason = prompt("Ban reason:");
                if (reason) ban.mutate(reason);
              }}
              className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded hover:bg-red-50"
            >
              Ban Organization
            </button>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Created: {new Date(org.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ID: {org.id}
      </div>
    </div>
  );
}
