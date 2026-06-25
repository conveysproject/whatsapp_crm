"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-fetch";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import StatusSlideOver, { type StatusDraft } from "./StatusSlideOver";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccessSub } from "@/lib/can";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface LeadStatus {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isClosure: boolean;
}

export default function LeadStatusesTab(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccessSub(user, "contacts_access", "contacts_manage_custom_fields");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<StatusDraft | null | undefined>(undefined); // undefined=closed, null=add, draft=edit
  const [error, setError] = useState<string | null>(null);

  const { data: statuses = [], isLoading } = useQuery<LeadStatus[]>({
    queryKey: ["lead-statuses"],
    queryFn: async () => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/lead-statuses`, { token: token ?? "", silent: true });
      if (!res.ok) return [];
      return (await res.json() as { data: LeadStatus[] }).data;
    },
  });

  const save = useMutation({
    mutationFn: async (draft: { name: string; color: string }) => {
      const token = await getToken();
      const isEdit = editing && editing.id;
      const res = await clientFetch(
        isEdit ? `${API_URL}/v1/lead-statuses/${editing!.id}` : `${API_URL}/v1/lead-statuses`,
        {
          method: isEdit ? "PATCH" : "POST",
          token: token ?? "",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      if (!res.ok) throw new Error("Failed to save status");
    },
    onSuccess: () => { setEditing(undefined); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/lead-statuses/${id}`, { method: "DELETE", token: token ?? "" });
      if (res.status === 409) throw new Error("This status is assigned to contacts — reassign them before deleting.");
      if (!res.ok) throw new Error("Failed to delete status");
    },
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
    onError: (e: Error) => setError(e.message),
  });

  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/lead-statuses/reorder`, {
        method: "PATCH",
        token: token ?? "",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder statuses");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead-statuses"] }),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => { setError(null); setEditing(null); }}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Add Status
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">
          <span />
          <span>Status Name</span>
          <span>Colour</span>
          <span />
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading…</p>
        ) : statuses.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No lead statuses yet.</p>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              const oldIndex = statuses.findIndex((s) => s.id === active.id);
              const newIndex = statuses.findIndex((s) => s.id === over.id);
              const ordered = arrayMove(statuses, oldIndex, newIndex);
              qc.setQueryData<LeadStatus[]>(["lead-statuses"], ordered);
              reorder.mutate(ordered.map((s) => s.id));
            }}
          >
            <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-gray-50">
                {statuses.map((s) => (
                  <SortableStatusRow
                    key={s.id}
                    status={s}
                    canManage={canManage}
                    onEdit={() => { setError(null); setEditing({ id: s.id, name: s.name, color: s.color }); }}
                    onDelete={() => remove.mutate(s.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {editing !== undefined && (
        <StatusSlideOver
          initial={editing}
          saving={save.isPending}
          onSave={(draft) => save.mutate(draft)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function SortableStatusRow({
  status,
  canManage,
  onEdit,
  onDelete,
}: {
  status: LeadStatus;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: status.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-3 bg-white">
      {canManage
        ? <button {...attributes} {...listeners} aria-label="Drag to reorder" className="cursor-grab text-gray-300 hover:text-gray-500">⋮⋮</button>
        : <span className="w-5" />}
      <span className="text-sm font-medium text-gray-900">{status.name}</span>
      <span className="w-5 h-5 rounded-full" style={{ backgroundColor: status.color }} />
      <div className="flex items-center gap-3">
        {canManage && <button onClick={onEdit} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>}
        {canManage && <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>}
      </div>
    </div>
  );
}
