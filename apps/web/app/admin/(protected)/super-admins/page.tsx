"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface SuperAdmin {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } })) as { error: { message: string } };
      throw new Error(body.error.message);
    }
    return res.json() as Promise<T>;
  };
}

export default function SuperAdminsPage(): JSX.Element {
  const qc = useQueryClient();
  const adminFetch = useAdminFetch();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: SuperAdmin[] }>({
    queryKey: ["super-admins"],
    queryFn: () => adminFetch("/v1/admin/super-admins"),
  });

  const create = useMutation({
    mutationFn: (body: { email: string; firstName: string; lastName: string }) =>
      adminFetch("/v1/admin/super-admins", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["super-admins"] });
      setShowForm(false);
      setForm({ email: "", firstName: "", lastName: "" });
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/v1/admin/super-admins/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super-admins"] }),
  });

  const admins = data?.data ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Super Admins</h1>
          <p className="text-sm text-gray-500 mt-1">Platform-level administrators with full access</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          + Add Super Admin
        </button>
      </div>

      {showForm && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-5 space-y-4">
          <h2 className="font-medium text-red-900">New Super Admin</h2>
          <p className="text-xs text-red-700">
            A Clerk account will be created. The new admin will receive login credentials via email
            and must set up MFA before accessing the platform.
          </p>

          {formError && (
            <p className="text-sm text-red-600 bg-red-100 border border-red-200 rounded px-3 py-2">{formError}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">First Name</label>
              <input
                className="w-full border rounded px-3 py-1.5 text-sm"
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Last Name</label>
              <input
                className="w-full border rounded px-3 py-1.5 text-sm"
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Last name"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded px-3 py-1.5 text-sm"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="admin@trustcrm.in"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => create.mutate(form)}
              disabled={create.isPending || !form.email || !form.firstName || !form.lastName}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create Super Admin"}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(null); }}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {admins.map((admin) => (
            <div key={admin.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">{admin.fullName}</p>
                <p className="text-xs text-gray-500">{admin.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Added {new Date(admin.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  {!admin.isActive && <span className="ml-2 text-red-500 font-medium">Deactivated</span>}
                </p>
              </div>
              {admin.isActive && (
                <button
                  onClick={() => {
                    if (confirm(`Deactivate ${admin.email}? They will lose all admin access immediately.`)) {
                      deactivate.mutate(admin.id);
                    }
                  }}
                  disabled={deactivate.isPending}
                  className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                >
                  Deactivate
                </button>
              )}
            </div>
          ))}
          {admins.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No super admins found.</p>
          )}
        </div>
      )}
    </div>
  );
}
