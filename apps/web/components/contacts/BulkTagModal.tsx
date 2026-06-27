"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { TagCombobox } from "./TagCombobox";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface BulkTagModalProps {
  contactIds: string[];
  onClose: () => void;
  onSuccess: (tags: string[]) => void;
}

export function BulkTagModal({ contactIds, onClose, onSuccess }: BulkTagModalProps): JSX.Element {
  const { getToken } = useAuth();
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!tags.length) return;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/bulk/assign-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ contactIds, tags }),
      });
      if (!res.ok) throw new Error("Failed");
      onSuccess(tags);
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900">
          Assign tags to {contactIds.length} contact{contactIds.length !== 1 ? "s" : ""}
        </h2>
        <TagCombobox tags={tags} onChange={setTags} placeholder="Search or create tags…" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={saving || tags.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Assigning…" : "Assign Tags"}
          </button>
        </div>
      </div>
    </div>
  );
}
