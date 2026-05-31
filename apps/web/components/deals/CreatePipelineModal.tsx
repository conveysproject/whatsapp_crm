"use client";
import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const DEFAULT_STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

interface CreatePipelineModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePipelineModal({ onClose, onCreated }: CreatePipelineModalProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [name, setName] = useState("");
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const [newStage, setNewStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStage() {
    const trimmed = newStage.trim();
    if (trimmed && !stages.includes(trimmed)) {
      setStages((prev) => [...prev, trimmed]);
      setNewStage("");
    }
  }

  function removeStage(idx: number) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    if (!name.trim() || stages.length === 0) return;
    setSaving(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`${api}/v1/pipelines`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), stages }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to create pipeline. Please try again.");
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Create Pipeline</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Pipeline name *</label>
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g. Sales, Renewals, Partnerships"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Stages</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {stages.map((s, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                {s}
                <button onClick={() => removeStage(idx)} className="text-gray-400 hover:text-gray-600 leading-none">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Add a stage..."
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStage()}
            />
            <button onClick={addStage} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              Add
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || stages.length === 0 || saving}
            className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Pipeline"}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
