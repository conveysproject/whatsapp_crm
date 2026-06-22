"use client";
import { JSX, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PermissionsGrid } from "@/components/permissions-grid";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isAdmin } from "@/lib/can";

type RoleKey = "superAdmin" | "admin" | "manager" | "agent" | "viewer";

const ROLES: RoleKey[] = ["superAdmin", "admin", "manager", "agent", "viewer"];

const ROLE_LABELS: Record<RoleKey, string> = {
  superAdmin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
  viewer: "Viewer",
};

type RolePermissionsResponse = { data: Record<RoleKey, Record<string, string>> };

async function fetchRolePermissions(): Promise<RolePermissionsResponse> {
  const res = await fetch("/api/v1/roles/permissions");
  if (!res.ok) throw new Error("Failed to load role permissions");
  return res.json() as Promise<RolePermissionsResponse>;
}

async function saveRolePermissions(
  role: RoleKey,
  permissions: Record<string, string>
): Promise<void> {
  const res = await fetch(`/api/v1/roles/${role}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  if (!res.ok) throw new Error("Failed to save permissions");
}

export default function RolesPage(): JSX.Element {
  const { user, isLoading: userLoading } = useCurrentUser();
  const [activeRole, setActiveRole] = useState<RoleKey>("admin");
  const [localPermissions, setLocalPermissions] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<RolePermissionsResponse>({
    queryKey: ["role-permissions"],
    queryFn: fetchRolePermissions,
  });

  useEffect(() => {
    if (data) {
      setLocalPermissions(data.data[activeRole] ?? {});
      setSaved(false);
    }
  }, [activeRole, data]);

  const saveMutation = useMutation({
    mutationFn: () => saveRolePermissions(activeRole, localPermissions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (!userLoading && !isAdmin(user)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="text-lg font-semibold text-gray-900">Access Denied</p>
        <p className="text-sm text-gray-500">Only admins can manage role permissions.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage access to features for your team. Set defaults per role.
        </p>
      </div>

      <div className="flex gap-0 border-b border-gray-200">
        {ROLES.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setActiveRole(role)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeRole === role
                ? "border-green-600 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading permissions…</div>
      ) : (
        <>
          <PermissionsGrid permissions={localPermissions} onChange={setLocalPermissions} />

          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && (
              <span className="text-sm text-green-600">Saved successfully</span>
            )}
            {saveMutation.isError && (
              <span className="text-sm text-red-500">Failed to save. Try again.</span>
            )}
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending
                ? "Saving…"
                : `Save ${ROLE_LABELS[activeRole]} permissions`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
