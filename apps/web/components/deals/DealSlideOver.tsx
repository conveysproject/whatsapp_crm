"use client";
import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Deal } from "./DealCard";

interface DealSlideOverProps {
  deal: Deal;
  stages: string[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function DealSlideOver({ deal, stages, onClose, onUpdated, onDeleted }: DealSlideOverProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(deal.value != null ? String(deal.value) : "");
  const [stage, setStage] = useState(deal.stage);
  const [notes, setNotes] = useState(deal.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactName = deal.contact
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ") || deal.contact.phoneNumber || ""
    : null;

  const [notifyContact, setNotifyContact] = useState(false);

  useEffect(() => {
    setTitle(deal.title);
    setValue(deal.value != null ? String(deal.value) : "");
    setStage(deal.stage);
    setNotes(deal.notes ?? "");
    setError(null);
    setConfirmDelete(false);
    setNotifyContact(false);
  }, [deal]);

  async function handleSave(sendNotification = true) {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const token = await getToken();

    const res = await fetch(`${api}/v1/deals/${deal.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        value: value ? parseFloat(value) : null,
        stage,
        notes: notes.trim() || null,
      }),
    });

    if (!res.ok) {
      setSaving(false);
      setError("Failed to save. Please try again.");
      return;
    }

    try {
      if (sendNotification && notifyContact && deal.contact && notes.trim()) {
        const convRes = await fetch(`${api}/v1/conversations?contactId=${deal.contact.id}&limit=1`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (convRes.ok) {
          const convBody = await convRes.json() as { data: Array<{ id: string }> };
          const conv = convBody.data[0];
          if (conv) {
            const msgRes = await fetch(`${api}/v1/conversations/${conv.id}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                contentType: "interactive",
                interactive: {
                  type: "button",
                  header: { type: "text", text: `Deal: ${title.trim().slice(0, 54)}` },
                  body: { text: `Value: ${value || "–"}\n\n${notes.trim()}` },
                  footer: { text: "Reply using the buttons below" },
                  action: {
                    buttons: [
                      { type: "reply", reply: { id: `deal_accept_${deal.id}`, title: "Accept" } },
                      { type: "reply", reply: { id: `deal_reject_${deal.id}`, title: "Reject" } },
                      { type: "reply", reply: { id: `deal_negotiate_${deal.id}`, title: "Negotiate" } },
                    ],
                  },
                },
              }),
            });
            if (!msgRes.ok) {
              setError("Deal saved, but message failed to send. Please try again from the inbox.");
            }
          } else {
            setError("Deal saved. No active WhatsApp conversation found — message not sent.");
          }
        } else {
          setError("Deal saved, but could not reach server to send notification.");
        }
      }
    } finally {
      setSaving(false);
      onUpdated();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`${api}/v1/deals/${deal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    setDeleting(false);
    if (!res.ok) {
      setError("Failed to delete. Please try again.");
      return;
    }
    onDeleted();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Deal Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {contactName && (
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">Contact:</span> {contactName}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              rows={4}
              placeholder="Add notes about this deal..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Notify contact — only shown when deal has a linked contact */}
          {deal.contact && (
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Notify contact on save</label>
                <button
                  type="button"
                  onClick={() => setNotifyContact((v) => !v)}
                  className={[
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    notifyContact ? "bg-green-500" : "bg-gray-200",
                  ].join(" ")}
                >
                  <span className={["inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", notifyContact ? "translate-x-4" : "translate-x-1"].join(" ")} />
                </button>
              </div>
              {notifyContact && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-sm">
                  <p className="font-semibold text-gray-800 truncate">Deal: {title.trim() || "—"}</p>
                  <p className="text-gray-600">Value: {value || "—"}</p>
                  {notes.trim() ? (
                    <p className="text-gray-600 whitespace-pre-wrap text-xs">{notes.trim()}</p>
                  ) : (
                    <p className="text-amber-600 text-xs">Add notes to give the contact context before sending.</p>
                  )}
                  <div className="flex gap-1.5 pt-1 flex-wrap">
                    <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">Accept</span>
                    <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">Reject</span>
                    <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">Negotiate</span>
                  </div>
                  <p className="text-xs text-gray-400">Sent to {contactName}&apos;s active WhatsApp conversation.</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {notifyContact ? (
            <>
              <button
                onClick={() => void handleSave(true)}
                disabled={saving || !title.trim() || !notes.trim()}
                className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Sending..." : "Save & Send"}
              </button>
              <button
                onClick={() => void handleSave(false)}
                disabled={saving || !title.trim()}
                className="w-full py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Save without notifying
              </button>
            </>
          ) : (
            <button
              onClick={() => void handleSave()}
              disabled={saving || !title.trim()}
              className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50"
            >
              Delete Deal
            </button>
          )}
        </div>
      </div>
    </>
  );
}
