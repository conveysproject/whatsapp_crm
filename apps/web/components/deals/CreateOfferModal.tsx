"use client";
import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

interface Pipeline {
  id: string;
  name: string;
  stages: string[];
}

interface CreateOfferModalProps {
  contactId: string;
  contactName: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateOfferModal({ contactId, contactName, onClose, onCreated }: CreateOfferModalProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState(true);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${api}/v1/pipelines`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return;
      const body = await res.json() as { data: Pipeline[] };
      setPipelines(body.data);
      if (body.data.length > 0) {
        const first = body.data[0]!;
        setPipelineId(first.id);
        setStages(first.stages);
        setStage(first.stages[0] ?? "Lead");
      }
    })();
  }, []);

  function onPipelineChange(id: string) {
    const p = pipelines.find((x) => x.id === id);
    if (!p) return;
    setPipelineId(id);
    setStages(p.stages);
    setStage(p.stages[0] ?? "Lead");
  }

  async function handleSubmit(withMessage: boolean) {
    if (!title.trim() || !pipelineId) return;
    setSaving(true);
    setError(null);
    const token = await getToken();

    const dealRes = await fetch(`${api}/v1/deals`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        pipelineId,
        stage,
        value: value ? parseFloat(value) : undefined,
        contactId,
        notes: notes.trim() || undefined,
      }),
    });

    if (!dealRes.ok) {
      setSaving(false);
      setError("Failed to create deal. Please try again.");
      return;
    }

    const dealData = await dealRes.json() as { data: { id: string } };
    const dealId = dealData.data.id;

    try {
      if (withMessage) {
        const convRes = await fetch(`${api}/v1/conversations?contactId=${contactId}&limit=1`, {
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
                  body: { text: `Value: ${value || "–"}` },
                  footer: { text: "Reply using the buttons below" },
                  action: {
                    buttons: [
                      { type: "reply", reply: { id: `deal_accept_${dealId}`, title: "✓ Accept" } },
                      { type: "reply", reply: { id: `deal_reject_${dealId}`, title: "✗ Reject" } },
                      { type: "reply", reply: { id: `deal_negotiate_${dealId}`, title: "~ Negotiate" } },
                    ],
                  },
                },
              }),
            });
            if (!msgRes.ok) {
              setError("Deal created, but message failed to send. Please try again from the inbox.");
            }
          } else {
            setError("Deal created. No active WhatsApp conversation found — message not sent.");
          }
        } else {
          setError("Deal created, but could not reach server to send notification.");
        }
      }
    } finally {
      setSaving(false);
      onCreated();
      onClose();
    }
  }

  if (pipelines.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-semibold mb-4">Create Offer</h2>
          <p className="text-sm text-gray-500">No pipelines found. Please create a pipeline in the Deals section first.</p>
          <button onClick={onClose} className="mt-4 w-full py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-semibold">Create Offer</h2>
          <p className="text-xs text-gray-400 mt-0.5">For: {contactName || "this contact"}</p>
        </div>

        {pipelines.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Pipeline</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={pipelineId}
              onChange={(e) => onPipelineChange(e.target.value)}
            >
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Deal title *</label>
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g. Premium plan — 10 seats"
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
              {stages.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Internal notes</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            rows={2}
            placeholder="Notes visible only to your team..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-700">Send WhatsApp message</label>
            <button
              type="button"
              onClick={() => setSendMsg((v) => !v)}
              className={[
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                sendMsg ? "bg-green-500" : "bg-gray-200",
              ].join(" ")}
            >
              <span className={["inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", sendMsg ? "translate-x-4" : "translate-x-1"].join(" ")} />
            </button>
          </div>
          {sendMsg && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-gray-800 truncate">Deal: {title.trim() || "—"}</p>
              <p className="text-gray-600">Value: {value || "—"}</p>
              <div className="flex gap-1.5 pt-1 flex-wrap">
                <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">✓ Accept</span>
                <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">✗ Reject</span>
                <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">~ Negotiate</span>
              </div>
              <p className="text-xs text-gray-400">Sent to the contact&apos;s active WhatsApp conversation.</p>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => void handleSubmit(sendMsg)}
            disabled={saving || !title.trim() || !pipelineId}
            className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : sendMsg ? "Create & Send Offer" : "Save Deal Only"}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
