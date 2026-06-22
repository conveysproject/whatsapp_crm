"use client";

import { JSX, useState, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactGroup {
  id: string;
  title: string;
  description: string | null;
  isArchived: boolean;
  _count: { contacts: number };
}

type ModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; group: ContactGroup };

export default function ContactGroupsPage(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "contacts_access");
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalState>({ type: "closed" });
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const { data, isLoading } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups", showArchived],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `${API_URL}/v1/contact-groups?archived=${showArchived}`,
        { headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
      if (!res.ok) return [];
      return (await res.json() as { data: ContactGroup[] }).data;
    },
  });

  const groups = useMemo(() => {
    const q = search.toLowerCase();
    return (data ?? []).filter(
      (g) =>
        !q ||
        g.title.toLowerCase().includes(q) ||
        (g.description ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  function openCreate() {
    setFormTitle("");
    setFormDesc("");
    setModal({ type: "create" });
  }

  function openEdit(group: ContactGroup) {
    setFormTitle(group.title);
    setFormDesc(group.description ?? "");
    setModal({ type: "edit", group });
  }

  function closeModal() {
    setModal({ type: "closed" });
  }

  const saveGroup = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (modal.type === "create") {
        return fetch(`${API_URL}/v1/contact-groups`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: formTitle, description: formDesc || undefined }),
        });
      }
      if (modal.type === "edit") {
        return fetch(`${API_URL}/v1/contact-groups/${modal.group.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title: formTitle, description: formDesc || undefined }),
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contact-groups"] });
      closeModal();
    },
  });

  const archiveGroup = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const token = await getToken();
      return fetch(
        `${API_URL}/v1/contact-groups/${id}/${archive ? "archive" : "unarchive"}`,
        { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` } }
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contact-groups"] }),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return fetch(`${API_URL}/v1/contact-groups/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contact-groups"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Contact Groups</h1>
        {canManage && <Button onClick={openCreate}>Add New Group</Button>}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["Active", "Archive"] as const).map((tab) => {
          const archived = tab === "Archive";
          return (
            <button
              key={tab}
              onClick={() => setShowArchived(archived)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                showArchived === archived
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Input
          placeholder="Search groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacts</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  {search ? "No groups match your search." : "No groups yet. Create one to start organising contacts."}
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{group.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{group.description ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{group._count.contacts}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/contacts/groups/${group.id}`}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                      >
                        Group Contacts
                      </Link>
                      {canManage && (
                        <button
                          onClick={() => openEdit(group)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => {
                            if (confirm("Delete this group? This cannot be undone.")) {
                              deleteGroup.mutate(group.id);
                            }
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => archiveGroup.mutate({ id: group.id, archive: !group.isArchived })}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"
                        >
                          {group.isArchived ? "Unarchive" : "Archive"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal.type !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {modal.type === "create" ? "Add New Group" : "Edit Group"}
            </h2>
            <Input
              label="Title"
              placeholder="Group name"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <textarea
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                rows={3}
                placeholder="Optional description"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={closeModal}>Close</Button>
              <Button
                onClick={() => saveGroup.mutate()}
                disabled={!formTitle.trim() || saveGroup.isPending}
              >
                {saveGroup.isPending ? "Saving…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
