"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard.js";
import { Button } from "@/components/ui/Button";
import type { DbField, FieldMappingEntry } from "@trustcrm/shared";

const DB_FIELD_OPTIONS: { value: DbField; label: string }[] = [
  { value: "fullPhoneNumber", label: "Full Phone Number" },
  { value: "phoneNumber", label: "Phone Number" },
  { value: "countryCode", label: "Country Code" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "lifecycleStage", label: "Lifecycle Stage" },
  { value: "tags", label: "Tags" },
  { value: "skip", label: "— Skip —" },
];

function autoSuggest(col: string): DbField {
  const lower = col.toLowerCase().replace(/[\s_-]/g, "");
  if (lower.includes("fullphone") || (lower.includes("phone") && lower.includes("full"))) return "fullPhoneNumber";
  if (lower.includes("countrycode") || lower === "cc" || lower === "isd") return "countryCode";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("whatsapp")) return "phoneNumber";
  if (lower.includes("name")) return "name";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("lifecycle") || lower.includes("stage")) return "lifecycleStage";
  if (lower.includes("tag")) return "tags";
  return "skip";
}

function validateMapping(mapping: FieldMappingEntry[]): string | null {
  const hasFull = mapping.some((e) => e.dbField === "fullPhoneNumber");
  const hasPhone = mapping.some((e) => e.dbField === "phoneNumber");
  const hasCC = mapping.some((e) => e.dbField === "countryCode");
  if (hasFull && (hasPhone || hasCC)) return "Map either Full Phone Number OR Phone Number + Country Code — not both.";
  if (!hasFull && !hasPhone) return "Map at least one phone column to continue.";
  if (hasPhone && !hasCC) return "Country Code column is required when Phone Number is mapped.";
  if (hasCC && !hasPhone) return "Phone Number column is required when Country Code is mapped.";
  return null;
}

export function Step2MapFields(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.mapping.length === 0 && state.columns.length > 0) {
      setState({ mapping: state.columns.map((col) => ({ csvColumn: col, dbField: autoSuggest(col) })) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateMapping(csvColumn: string, dbField: DbField) {
    setState({ mapping: state.mapping.map((e) => e.csvColumn === csvColumn ? { ...e, dbField } : e) });
  }

  const validationError = validateMapping(state.mapping);

  async function handleNext() {
    if (validationError) return;
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ sessionId: state.sessionId, fieldMapping: state.mapping }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [] });
        return;
      }
      if (!res.ok) {
        setError("Analysis failed. Please try again.");
        return;
      }
      const body = await res.json() as { data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } };
      setState({ analysisResult: body.data, totalRows: body.data.totalRows });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Map CSV columns to contact fields</h2>
        <p className="text-sm text-gray-500 mt-1">We have suggested mappings based on your column names. Adjust as needed.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="pb-2 pr-4">CSV Column</th>
              <th className="pb-2 pr-4">Maps to</th>
              <th className="pb-2">Sample value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state.mapping.map((entry) => (
              <tr key={entry.csvColumn}>
                <td className="py-2 pr-4 font-mono text-gray-700 text-xs">{entry.csvColumn}</td>
                <td className="py-2 pr-4">
                  <select
                    value={entry.dbField}
                    onChange={(e) => updateMapping(entry.csvColumn, e.target.value as DbField)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {DB_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-gray-400 text-xs truncate max-w-[180px]">
                  {state.sampleRows[0]?.[entry.csvColumn] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {validationError && <p className="text-sm text-amber-600">{validationError}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={() => { void handleNext(); }} disabled={!!validationError || loading}>
          {loading ? "Analysing…" : "Next"}
        </Button>
      </div>
    </div>
  );
}
