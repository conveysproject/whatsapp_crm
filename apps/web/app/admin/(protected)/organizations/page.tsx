"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

type CleanupResult = { dryRun: boolean; deleted: { id: string; name: string; reason: string }[] };

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Org {
  id: string;
  name: string;
  status: string;
  planTier: string;
  createdAt: string;
  _count: { members: number };
}

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

export default function AdminOrgsPage(): JSX.Element {
  const qc = useQueryClient();
  const adminFetch = useAdminFetch();
  const [search, setSearch] = useState("");
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<CleanupResult | null>(null);

  const cleanup = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await adminFetch<{ data: CleanupResult }>(
        `/v1/admin/organizations/cleanup`,
        { method: dryRun ? "GET" : "DELETE" }
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data.dryRun) {
        setCleanupPreview(data);
      } else {
        setCleanupPreview(null);
        void qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      }
    },
  });

  const { data } = useQuery<{ data: Org[]; total: number }>({
    queryKey: ["admin-orgs"],
    queryFn: () => adminFetch("/v1/admin/organizations"),
  });

  const ban = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminFetch(`/v1/admin/organizations/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });

  const unban = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/v1/admin/organizations/${id}/unban`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });

  async function loginAs(org: Org) {
    setImpersonating(org.id);
    try {
      const res = await adminFetch<{ data: { token: string } }>(`/v1/admin/organizations/${org.id}/impersonate`, { method: "POST" });
      sessionStorage.setItem("impersonation", JSON.stringify({ token: res.data.token, orgId: org.id, orgName: org.name }));
      window.location.href = "/dashboard";
    } finally {
      setImpersonating(null);
    }
  }

  const orgs = (data?.data ?? []).filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  const statusColor: Record<string, string> = { active: "text-green-600", banned: "text-red-600", inactive: "text-gray-400" };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500">{data?.total ?? 0} total</p>
          <button
            onClick={() => cleanup.mutate(true)}
            disabled={cleanup.isPending}
            className="text-xs px-3 py-1.5 border border-orange-300 text-orange-700 rounded hover:bg-orange-50 disabled:opacity-50"
          >
            {cleanup.isPending ? "Checking…" : "Validate vs Clerk"}
          </button>
        </div>
      </div>

      {cleanupPreview && (
        <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-orange-900">
              {cleanupPreview.deleted.length === 0
                ? "All organizations have valid Clerk users."
                : `${cleanupPreview.deleted.length} ghost org(s) found — no valid Clerk users`}
            </p>
            <button onClick={() => setCleanupPreview(null)} className="text-xs text-orange-600 hover:underline">Dismiss</button>
          </div>
          {cleanupPreview.deleted.length > 0 && (
            <>
              <ul className="text-xs text-orange-800 space-y-1">
                {cleanupPreview.deleted.map((o) => (
                  <li key={o.id} className="flex items-center gap-2">
                    <span className="font-medium">{o.name}</span>
                    <span className="text-orange-500">({o.reason})</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { if (confirm(`Delete ${cleanupPreview.deleted.length} ghost org(s)? This cannot be undone.`)) cleanup.mutate(false); }}
                disabled={cleanup.isPending}
                className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {cleanup.isPending ? "Deleting…" : "Delete Ghost Orgs"}
              </button>
            </>
          )}
        </div>
      )}

      <input
        className="w-full max-w-sm border rounded px-3 py-2 text-sm"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="border rounded-lg divide-y">
        {orgs.map((org) => (
          <div key={org.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">{org.name}</p>
              <p className="text-xs text-gray-500">
                {org._count.members} members · <span className="capitalize">{org.planTier}</span> · {new Date(org.createdAt).toLocaleDateString("en-IN")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium capitalize ${statusColor[org.status] ?? "text-gray-500"}`}>{org.status}</span>
              <button
                onClick={() => { void loginAs(org); }}
                disabled={impersonating === org.id}
                className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {impersonating === org.id ? "…" : "Login As"}
              </button>
              {org.status === "banned" ? (
                <button onClick={() => unban.mutate(org.id)} className="text-xs px-2 py-1 border border-green-300 text-green-700 rounded hover:bg-green-50">Unban</button>
              ) : (
                <button
                  onClick={() => {
                    const reason = prompt("Ban reason:");
                    if (reason) ban.mutate({ id: org.id, reason });
                  }}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  Ban
                </button>
              )}
              <a href={`/admin/organizations/${org.id}`} className="text-xs text-blue-600 hover:underline">Details</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
