"use client";

import { JSX, useRef, useState, DragEvent, ChangeEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard";
import { TagInput } from "@/components/contacts/TagInput";
import { Button } from "@/components/ui/Button";

const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"] as const;

export function Step1Upload(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are accepted.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds the 50 MB limit.");
      return;
    }
    setUploading(true);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      if (!res.ok) {
        setError("Upload failed. Please check your file and try again.");
        return;
      }
      const body = await res.json() as { data: { sessionId: string; columns: string[]; sampleRows: Record<string, string>[] } };
      setState({ sessionId: body.data.sessionId, columns: body.data.columns, sampleRows: body.data.sampleRows });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Upload instructions</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Max 50 MB allowed (up to 500,000 contacts)</li>
          <li>CSV must contain: <strong>Phone Number &amp; Country Code</strong> in any 2 columns, OR <strong>Full Phone Number</strong> (country code + number combined) in any 1 column</li>
          <li>If 2 contacts in the CSV have the same phone number, only the first will be imported</li>
          <li>If a contact already exists in your account, you can choose to update or skip it in the next step</li>
        </ul>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragging ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"}`}
      >
        <p className="text-sm text-gray-600">Drag &amp; drop your CSV here, or <span className="text-brand-600 font-medium">browse files</span></p>
        <p className="mt-1 text-xs text-gray-400">.csv only · max 50 MB</p>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onInputChange} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lifecycle stage for all contacts in this file
          </label>
          <select
            value={state.lifecycleStage}
            onChange={(e) => setState({ lifecycleStage: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Apply tags to all contacts in this file
          </label>
          <TagInput tags={state.batchTags} onChange={(tags) => setState({ batchTags: tags })} />
        </div>
      </div>

      {uploading && <p className="text-sm text-gray-500 animate-pulse">Uploading and parsing file…</p>}
    </div>
  );
}
