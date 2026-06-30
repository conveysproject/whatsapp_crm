"use client";

import { JSX, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useContactDetail } from "@/hooks/useContactDetail";
import { ContactTrustBadge } from "@/components/trust-score/ContactTrustBadge";
import { TagCombobox } from "@/components/contacts/TagCombobox";
import { getTagColor } from "@/lib/tag-color";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
  contactName: string;
  conversationStatus: string;
  lastMessageAt: string | null;
  onCreateDeal: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ContactPanel({ contactId, contactName, conversationStatus, lastMessageAt, onCreateDeal }: Props): JSX.Element {
  const { data: contact, isLoading } = useContactDetail(contactId);
  const { getToken } = useAuth();
  const [notes, setNotes] = useState<string>("");
  const [notesSaved, setNotesSaved] = useState(false);
  const savedNotesRef = useRef<string>("");
  const [editingTags, setEditingTags] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Initialise notes and tags once contact loads (useEffect avoids render-time setState)
  useEffect(() => {
    if (contact) {
      setNotes(contact.notes ?? "");
      savedNotesRef.current = contact.notes ?? "";
      setLocalTags(contact.tags ?? []);
    }
  }, [contact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNotesBlur() {
    if (notes === savedNotesRef.current) return;
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      savedNotesRef.current = notes;
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch { /* non-critical */ }
  }

  async function handleSaveTags() {
    setSavingTags(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tags: localTags }),
      });
      setEditingTags(false);
    } catch { /* non-critical */ }
    finally { setSavingTags(false); }
  }

  const initials = contactName.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Contact Details</h3>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 overflow-y-auto">
          {/* Identity */}
          <div className="px-4 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-green-700">{initials || "?"}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{contactName}</p>
              <p className="text-xs text-gray-500 mt-0.5">+{contact?.phoneNumber ?? "—"}</p>
              {contact?.email && (
                <p className="text-xs text-gray-500 truncate">{contact.email}</p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</p>
              {!editingTags && (
                <button
                  onClick={() => setEditingTags(true)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  Edit
                </button>
              )}
            </div>
            {editingTags ? (
              <div className="space-y-2">
                <TagCombobox tags={localTags} onChange={setLocalTags} placeholder="Add tag…" />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setEditingTags(false); setLocalTags(contact?.tags ?? []); }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleSaveTags()}
                    disabled={savingTags}
                    className="text-xs font-medium text-white bg-brand-600 px-3 py-1 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                  >
                    {savingTags ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : localTags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {localTags.map((tag) => {
                  const { bg, text } = getTagColor(tag);
                  return (
                    <span key={tag} className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${bg} ${text}`}>{tag}</span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No tags</p>
            )}
          </div>

          {/* Trust Score */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trust Score</p>
            <ContactTrustBadge contactId={contactId} />
          </div>

          {/* Deals */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deals</p>
              <button
                onClick={onCreateDeal}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Create
              </button>
            </div>
            <p className="text-xs text-gray-400">No deals yet</p>
          </div>

          {/* Notes */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</p>
              {notesSaved && <span className="text-xs text-green-600">Saved</span>}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { void handleNotesBlur(); }}
              placeholder="Add a note…"
              rows={3}
              className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Contact details */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Details</p>
            <dl className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <dt className="text-xs text-gray-400">First contact</dt>
                <dd className="text-xs text-gray-700">{formatDate(contact?.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-gray-400">Last message</dt>
                <dd className="text-xs text-gray-700">{formatDate(lastMessageAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-gray-400">Status</dt>
                <dd className="text-xs text-gray-700 capitalize">{conversationStatus}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
