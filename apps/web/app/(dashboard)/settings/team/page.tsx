"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PermissionsGrid } from "@/components/permissions-grid";

interface Member {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
  permissions: Record<string, string>;
}

export default function TeamPage(): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, string>>({});

  const { data, refetch } = useQuery<{ data: Member[] }>({
    queryKey: ["team-members"],
    queryFn: () => fetch("/api/v1/users").then((r) => r.json() as Promise<{ data: Member[] }>),
  });

  const savePermissions = useMutation({
    mutationFn: (memberId: string) =>
      fetch(`/api/v1/users/${memberId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setEditingId(null);
      setPermissions({});
      void refetch();
    },
  });

  const members = data?.data ?? [];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Team Permissions</h1>

      {editingId ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              Editing: {members.find((m) => m.id === editingId)?.fullName ?? editingId}
            </h2>
            <button
              onClick={() => { setEditingId(null); setPermissions({}); }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <PermissionsGrid permissions={permissions} onChange={setPermissions} />
          <button
            onClick={() => savePermissions.mutate(editingId)}
            disabled={savePermissions.isPending}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
          >
            {savePermissions.isPending ? "Saving..." : "Save Permissions"}
          </button>
        </div>
      ) : (
        <div className="divide-y border rounded-lg">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{member.fullName ?? member.email}</p>
                <p className="text-xs text-gray-500 capitalize">{member.role}</p>
              </div>
              <button
                onClick={() => { setEditingId(member.id); setPermissions(member.permissions ?? {}); }}
                className="text-sm text-blue-600 hover:underline"
              >
                Edit Permissions
              </button>
            </div>
          ))}
          {members.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No team members found.</p>
          )}
        </div>
      )}
    </div>
  );
}
