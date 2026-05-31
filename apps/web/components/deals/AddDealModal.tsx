"use client";
import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
}

interface AddDealModalProps {
  pipelineId: string;
  stages: string[];
  onClose: () => void;
  onCreated: () => void;
  defaultStage?: string;
}

export function AddDealModal({ pipelineId, stages, onClose, onCreated, defaultStage }: AddDealModalProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState(defaultStage ?? stages[0] ?? "new");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchContacts(q: string) {
    if (q.length < 2) { setContacts([]); return; }
    setSearching(true);
    const token = await getToken();
    const res = await fetch(`${api}/v1/contacts?search=${encodeURIComponent(q)}&limit=8`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (res.ok) {
      const body = await res.json() as { data: Contact[] };
      setContacts(body.data);
    }
    setSearching(false);
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`${api}/v1/deals`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        pipelineId,
        stage,
        value: value ? parseFloat(value) : undefined,
        contactId: selectedContact?.id,
        notes: notes.trim() || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to create deal. Please try again.");
      return;
    }
    onCreated();
    onClose();
  }

  const contactLabel = (c: Contact) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phoneNumber || c.id;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">New Deal</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Deal title *</label>
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g. Enterprise subscription renewal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Contact</label>
          {selectedContact ? (
            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <span>{contactLabel(selectedContact)}</span>
              <button onClick={() => { setSelectedContact(null); setContactSearch(""); }} className="text-gray-400 hover:text-gray-600 text-xs">Remove</button>
            </div>
          ) : (
            <div className="relative">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={(e) => { setContactSearch(e.target.value); void searchContacts(e.target.value); }}
              />
              {contacts.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto z-10">
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => { setSelectedContact(c); setContacts([]); setContactSearch(""); }}
                    >
                      {contactLabel(c)}
                      <span className="text-gray-400 ml-2 text-xs">{c.phoneNumber}</span>
                    </button>
                  ))}
                </div>
              )}
              {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            rows={2}
            placeholder="Any initial notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || saving}
            className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Deal"}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
