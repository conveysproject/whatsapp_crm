"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ContactGroup {
  id: string;
  title: string;
  description: string | null;
  isArchived: boolean;
  _count: { contacts: number };
}

export default function ContactGroupsPage(): JSX.Element {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data } = useQuery<{ data: ContactGroup[] }>({
    queryKey: ["contact-groups", showArchived],
    queryFn: () => fetch(`/api/v1/contact-groups?archived=${showArchived}`).then((r) => r.json()),
  });

  const createGroup = useMutation({
    mutationFn: (title: string) =>
      fetch("/api/v1/contact-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] });
      setCreating(false);
      setNewTitle("");
    },
  });

  const archiveGroup = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      fetch(`/api/v1/contact-groups/${id}/${archive ? "archive" : "unarchive"}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-groups"] }),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/contact-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-groups"] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contact Groups</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
            Show archived
          </label>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            New Group
          </button>
        </div>
      </div>

      {creating && (
        <div className="border rounded-lg p-4 flex gap-3">
          <input
            autoFocus
            className="flex-1 border rounded px-3 py-1.5 text-sm"
            placeholder="Group name"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newTitle && createGroup.mutate(newTitle)}
          />
          <button
            onClick={() => newTitle && createGroup.mutate(newTitle)}
            disabled={!newTitle || createGroup.isPending}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded disabled:opacity-50"
          >
            Create
          </button>
          <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
        </div>
      )}

      <div className="divide-y border rounded-lg">
        {(data?.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No groups yet. Create one to start organising contacts.</p>
        )}
        {(data?.data ?? []).map((group) => (
          <div key={group.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">{group.title}</p>
              <p className="text-xs text-gray-500">{group._count.contacts} contacts</p>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/contacts/groups/${group.id}`} className="text-xs text-blue-600 hover:underline">View contacts</a>
              <button
                onClick={() => archiveGroup.mutate({ id: group.id, archive: !group.isArchived })}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded"
              >
                {group.isArchived ? "Unarchive" : "Archive"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this group?")) deleteGroup.mutate(group.id);
                }}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
