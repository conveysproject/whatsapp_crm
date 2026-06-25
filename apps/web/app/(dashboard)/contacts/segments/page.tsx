"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";
import { PermissionGate } from "@/components/PermissionGate";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
  whatsappOptedOnly: boolean;
}

export default function SegmentsPage(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "contacts_access");
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFilters, setNewFilters] = useState<FilterRule[]>([]);
  const [newMatch, setNewMatch] = useState<MatchMode>("all");
  const [newWhatsappOptedOnly, setNewWhatsappOptedOnly] = useState(false);

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
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, filters: newFilters, match: newMatch, whatsappOptedOnly: newWhatsappOptedOnly }),
      });
      if (!res.ok) throw new Error("Failed to create segment");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["segments"] });
      setModalOpen(false);
      setNewName("");
      setNewFilters([]);
      setNewMatch("all");
      setNewWhatsappOptedOnly(false);
    },
  });

  return (
    <PermissionGate permission="contacts_access">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Segments</h1>
          {canManage && (
            <Button onClick={() => setModalOpen(true)}>+ Create New Segment</Button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : segments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No segments yet. Create one to target contacts in campaigns.</p>
          ) : segments.map((s) => (
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
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Segment modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold text-gray-900">Save Segment</Dialog.Title>
              <Dialog.Close className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <div className="mb-4">
              <input
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Segment name (e.g. All VIP Contacts)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <SegmentBuilderV2
              initial={newFilters}
              match={newMatch}
              whatsappOptedOnly={newWhatsappOptedOnly}
              onChange={setNewFilters}
              onMatchChange={setNewMatch}
              onWhatsappOptedOnlyChange={setNewWhatsappOptedOnly}
            />

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => createSegment.mutate()}
                disabled={!newName.trim() || createSegment.isPending}
              >
                {createSegment.isPending ? "Saving…" : "Save Segment"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PermissionGate>
  );
}
