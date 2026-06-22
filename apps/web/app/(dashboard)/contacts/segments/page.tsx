"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccessSub } from "@/lib/can";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Segment {
  id: string;
  name: string;
  filters: unknown[];
  match: "all" | "any";
}

export default function SegmentsPage(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccessSub(user, "campaigns_access", "campaigns_manage_segments");
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: segments = [], isLoading } = useQuery<Segment[]>({
    queryKey: ["segments"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Segment[] }).data;
    },
  });

  const createSegment = useMutation({
    mutationFn: async (name: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, filters: [] }),
      });
      if (!res.ok) throw new Error("Failed to create segment");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["segments"] });
      setCreating(false);
      setNewName("");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Segments</h1>
        {canManage && <Button onClick={() => setCreating(true)}>New Segment</Button>}
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Segment name (e.g. All Contacts)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) createSegment.mutate(newName.trim());
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
          />
          <Button
            onClick={() => createSegment.mutate(newName.trim())}
            disabled={!newName.trim() || createSegment.isPending}
          >
            {createSegment.isPending ? "Creating…" : "Create"}
          </Button>
          <Button variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
            Cancel
          </Button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>
        ) : segments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No segments yet. Create one to target contacts in campaigns.</p>
        ) : (
          segments.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.filters.length} filter{s.filters.length !== 1 ? "s" : ""} · {s.match === "any" ? "ANY" : "ALL"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="blue">{s.filters.length} rules</Badge>
                <Link href={`/contacts/segments/${s.id}`} className="text-sm text-brand-600 hover:underline">
                  View
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
