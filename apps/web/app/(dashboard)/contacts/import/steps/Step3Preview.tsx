"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard";
import { Button } from "@/components/ui/Button";

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 p-4 text-center space-y-1">
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {highlight && <p className="text-xs text-gray-400">{highlight}</p>}
    </div>
  );
}

export function Step3Preview(): JSX.Element {
  const { state, setState, nextStep, prevStep } = useWizard();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = state.analysisResult;

  async function handleConfirm() {
    if (!result) return;
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          sessionId: state.sessionId,
          fieldMapping: state.mapping,
          batchTags: state.batchTags,
          lifecycleStage: state.lifecycleStage,
          updateExisting: state.updateExisting,
          totalRows: state.totalRows,
        }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [], analysisResult: null });
        return;
      }
      if (!res.ok) {
        setError("Could not start import. Please try again.");
        return;
      }
      const body = await res.json() as { data: { importJobId: string; importToken: string } };
      setState({ importJobId: body.data.importJobId, importToken: body.data.importToken });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return <p className="text-sm text-gray-500">No analysis data. Please go back and re-upload.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Import preview</h2>
        <p className="text-sm text-gray-500 mt-1">Review the breakdown before importing.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total rows" value={result.totalRows} />
        <StatCard label="New contacts" value={result.newContacts} highlight="will be created" />
        <StatCard label="Duplicates in file" value={result.duplicatesInCsv} highlight="only first imported" />
        <StatCard
          label="Already in account"
          value={result.existingInDb}
          highlight={state.updateExisting ? "will be updated" : "will be skipped"}
        />
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={state.updateExisting}
          onChange={(e) => setState({ updateExisting: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-gray-700">Update existing contacts with data from this CSV</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={prevStep} disabled={loading}>Back</Button>
        <Button onClick={() => { void handleConfirm(); }} disabled={loading}>
          {loading ? "Starting…" : "Confirm & Import"}
        </Button>
      </div>
    </div>
  );
}
