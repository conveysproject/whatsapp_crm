"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Org {
  id: string;
  name: string;
  status: string;
  planTier: string;
  createdAt: string;
  _count: { members: number };
}

export default function AdminOrgsPage(): JSX.Element {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const { data } = useQuery<{ data: Org[]; total: number }>({
    queryKey: ["admin-orgs"],
    queryFn: () => fetch("/api/v1/admin/organizations").then((r) => r.json()),
  });

  const ban = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetch(`/api/v1/admin/organizations/${id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });

  const unban = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/admin/organizations/${id}/unban`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orgs"] }),
  });

  async function loginAs(org: Org) {
    setImpersonating(org.id);
    const res = await fetch(`/api/v1/admin/organizations/${org.id}/impersonate`, { method: "POST" });
    if (res.ok) {
      const json = await res.json() as { data: { token: string } };
      sessionStorage.setItem("impersonation", JSON.stringify({ token: json.data.token, orgId: org.id, orgName: org.name }));
      window.location.href = "/dashboard";
    }
    setImpersonating(null);
  }

  const orgs = (data?.data ?? []).filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  const statusColor: Record<string, string> = { active: "text-green-600", banned: "text-red-600", inactive: "text-gray-400" };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <p className="text-sm text-gray-500">{data?.total ?? 0} total</p>
      </div>

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
