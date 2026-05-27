"use client";

import { JSX, useRef, useState, DragEvent, ChangeEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard";
import { Button } from "@/components/ui/Button";

export function Step1Upload(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploadedFileName(null);
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
      if (state.sessionId) {
        await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/session/${state.sessionId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        }).catch(() => undefined);
      }
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
      setUploadedFileName(file.name);
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
        <div className="flex items-center justify-between">
          <p className="font-medium">Upload instructions</p>
          <a
            href="/sample-contacts-import.csv"
            download
            className="text-xs text-brand-600 font-medium hover:text-brand-800 underline"
            onClick={(e) => e.stopPropagation()}
          >
            Download sample CSV
          </a>
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Max 50 MB allowed (up to 500,000 contacts)</li>
          <li>CSV must include a phone number column (full international format, or separate number + country code columns)</li>
          <li>Duplicate phone numbers in the file: only the first row is imported</li>
          <li>Multiple tags in one column: separate with a pipe character (e.g. <span className="font-mono">vip|premium</span>)</li>
          <li>Custom field columns will not auto-map — select the matching field in the dropdown after upload</li>
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
      {uploading && <p className="text-sm text-gray-500 animate-pulse">Uploading and parsing file…</p>}

      {uploadedFileName && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-green-800">
            <span className="font-medium">{uploadedFileName}</span> — {state.columns.length} columns detected.
          </p>
          <Button onClick={nextStep}>Next</Button>
        </div>
      )}
    </div>
  );
}
