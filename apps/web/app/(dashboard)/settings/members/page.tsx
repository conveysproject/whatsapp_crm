"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Member {
  id: string;
  fullName: string;
  email: string;
  role: string;
  mobileNumber: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
  viewer: "Viewer",
};

const ROLES = ["admin", "manager", "agent", "viewer"] as const;

export default function MembersPage(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "agent" | "viewer">("agent");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data } = useQuery<{ data: Member[] }>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const token = await getToken();
      return fetch(`${API_URL}/v1/users`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      }).then((r) => r.json() as Promise<{ data: Member[] }>);
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return fetch(`${API_URL}/v1/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["team-members"] }); setDeleteId(null); },
  });

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: { message?: string } };
        setInviteError(json.error?.message ?? "Failed to send invitation.");
        return;
      }
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("agent");
      setInviteSuccess(`Invitation sent to ${inviteEmail}`);
      setTimeout(() => setInviteSuccess(null), 4000);
    } finally {
      setInviting(false);
    }
  }

  const members = (data?.data ?? []).filter((m) =>
    m.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Success toast */}
      {inviteSuccess && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {inviteSuccess}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Manage Agents</h1>
            <p className="text-sm text-gray-500">Invite team members and manage their roles from here.</p>
          </div>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite Agent
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Agents by Name"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-400"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone No.</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Logged In</th>
              <th className="w-20 px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">
                  {search ? "No agents match your search." : "No agents yet. Invite one above."}
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold shrink-0">
                        {(m.fullName ?? m.email).charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-gray-900">{m.fullName ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{m.mobileNumber ?? "—"}</td>
                  <td className="px-5 py-3.5 text-gray-600">{m.email}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 capitalize">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {m.lastSignInAt
                      ? new Date(m.lastSignInAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setDeleteId(m.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove agent"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Invite Agent</h2>
              <button onClick={() => setInviteOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => void sendInvite(e)} className="space-y-4">
              {inviteError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {inviteError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="agent@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Remove Agent</h2>
            <p className="text-sm text-gray-600">This will remove the agent from your organization. They will lose access immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => deleteMember.mutate(deleteId)}
                disabled={deleteMember.isPending}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMember.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
