"use client";

import { JSX, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";

interface ImportResult {
  created: number;
  skipped: number;
  total: number;
}

export default function ContactsImportPage(): JSX.Element {
  const { getToken } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    setError(null);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      if (!res.ok) {
        setError("Upload failed. Please check your file and try again.");
        return;
      }
      const body = await res.json() as { data: ImportResult };
      setResult(body.data);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Import Contacts</h1>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card space-y-4">
        <p className="text-sm text-gray-600">
          Upload a CSV file with columns: <code className="font-mono bg-gray-100 px-1 rounded">phoneNumber</code>,{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">name</code>,{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">email</code>,{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">lifecycleStage</code>,{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">tags</code> (semicolon-separated).
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
        />
        <Button onClick={() => { void handleUpload(); }} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload CSV"}
        </Button>

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Import complete — <strong>{result.created}</strong> created,{" "}
            <strong>{result.skipped}</strong> skipped out of{" "}
            <strong>{result.total}</strong> rows.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
