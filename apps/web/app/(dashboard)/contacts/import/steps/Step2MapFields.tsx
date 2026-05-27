"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard";
import { TagInput } from "@/components/contacts/TagInput";
import { Button } from "@/components/ui/Button";
import type { DbField, FieldMappingEntry } from "@WBMSG/shared";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"] as const;

interface GroupOption { id: string; title: string }
interface CustomFieldMeta { id: string; inputName: string; isRequired: boolean }

function autoSuggest(col: string): DbField {
  const lower = col.toLowerCase().replace(/[\s_-]/g, "");
  if (lower.includes("fullphone") || (lower.includes("phone") && lower.includes("full"))) return "fullPhoneNumber";
  if (lower.includes("countrycode") || lower === "cc" || lower === "isd") return "countryCode";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("whatsapp")) return "phoneNumber";
  if (lower === "firstname" || lower === "fname") return "firstName";
  if (lower === "lastname" || lower === "lname" || lower === "surname") return "lastName";
  if (lower === "name" || lower === "fullname" || lower === "contactname") return "fullName";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("lifecycle") || lower.includes("stage")) return "lifecycleStage";
  if (lower.includes("tag")) return "tags";
  return "skip";
}

function validateMapping(mapping: FieldMappingEntry[]): string | null {
  const hasFull = mapping.some((e) => e.dbField === "fullPhoneNumber");
  const hasPhone = mapping.some((e) => e.dbField === "phoneNumber");
  const hasCC = mapping.some((e) => e.dbField === "countryCode");
  if (!hasFull && !hasPhone) return "Map at least one phone column to continue.";
  // When Full Phone Number is mapped it handles the number on its own.
  // Phone Number / Country Code pairing rules only apply when Full Phone isn't mapped.
  if (!hasFull) {
    if (hasPhone && !hasCC) return "Country Code column is required when Phone Number is mapped.";
    if (hasCC && !hasPhone) return "Phone Number column is required when Country Code is mapped.";
  }
  return null;
}

function getRequiredNotMapped(mapping: FieldMappingEntry[], customFields: CustomFieldMeta[]): string[] {
  const mappedIds = new Set(
    mapping
      .filter((e) => e.dbField.startsWith("customField:"))
      .map((e) => e.dbField.slice("customField:".length))
  );
  return customFields.filter((cf) => cf.isRequired && !mappedIds.has(cf.id)).map((cf) => cf.inputName);
}

export function Step2MapFields(): JSX.Element {
  const { state, setState, nextStep, prevStep } = useWizard();
  const { getToken } = useAuth();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldMeta[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token ?? ""}` };
      const [groupsRes, cfRes] = await Promise.all([
        fetch(`${API_URL}/v1/contact-groups?archived=false`, { headers }),
        fetch(`${API_URL}/v1/contacts/custom-fields`, { headers }),
      ]);
      if (groupsRes.ok) {
        const body = await groupsRes.json() as { data: GroupOption[] };
        setGroups(body.data);
      }
      let fetchedCFs: CustomFieldMeta[] = [];
      if (cfRes.ok) {
        const body = await cfRes.json() as { data: CustomFieldMeta[] };
        fetchedCFs = body.data;
        setCustomFields(fetchedCFs);
      }
      if (state.mapping.length === 0 && state.columns.length > 0) {
        const cfByName = new Map(fetchedCFs.map((cf) => [cf.inputName.toLowerCase().replace(/[\s_-]/g, ""), cf.id]));
        setState({
          mapping: state.columns.map((col) => {
            const lower = col.toLowerCase().replace(/[\s_-]/g, "");
            const cfId = cfByName.get(lower);
            if (cfId) return { csvColumn: col, dbField: `customField:${cfId}` as DbField };
            return { csvColumn: col, dbField: autoSuggest(col) };
          }),
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  function updateMapping(csvColumn: string, dbField: DbField) {
    setState({
      mapping: state.mapping.map((e) => e.csvColumn === csvColumn ? { ...e, dbField } : e),
      analysisResult: null,
    });
  }

  const validationError = validateMapping(state.mapping);
  const requiredNotMapped = getRequiredNotMapped(state.mapping, customFields);
  const hasAnalysis = state.analysisResult !== null;
  const result = state.analysisResult;

  async function handlePreview() {
    if (validationError) return;
    setAnalyzing(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/import/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ sessionId: state.sessionId, fieldMapping: state.mapping }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [], analysisResult: null });
        return;
      }
      if (!res.ok) { setError("Analysis failed. Please try again."); return; }
      const body = await res.json() as { data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } };
      setState({ analysisResult: body.data, totalRows: body.data.totalRows });
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleStartImport() {
    if (!state.analysisResult) return;
    setStarting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/import/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          sessionId: state.sessionId,
          fieldMapping: state.mapping,
          batchTags: state.batchTags,
          batchGroupIds: state.batchGroupIds,
          lifecycleStage: state.lifecycleStage,
          updateExisting: state.updateExisting,
          totalRows: state.totalRows,
        }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [], analysisResult: null });
        return;
      }
      if (!res.ok) { setError("Could not start import. Please try again."); return; }
      const body = await res.json() as { data: { importJobId: string; importToken: string } };
      setState({ importJobId: body.data.importJobId, importToken: body.data.importToken });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Configure import</h2>
        <p className="text-sm text-gray-500 mt-1">Map your CSV columns, then set batch options before importing.</p>
      </div>

      {requiredNotMapped.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Required fields not mapped: <strong>{requiredNotMapped.join(", ")}</strong> — contacts will be imported without these values.
        </div>
      )}

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
                    <optgroup label="Identity">
                      <option value="firstName">First Name</option>
                      <option value="lastName">Last Name</option>
                      <option value="fullName">Full Name (auto-split)</option>
                      <option value="fullPhoneNumber">Full Phone Number</option>
                      <option value="phoneNumber">Phone Number</option>
                      <option value="email">Email</option>
                    </optgroup>
                    <optgroup label="Contact Info">
                      <option value="countryCode">Country Code</option>
                      <option value="lifecycleStage">Lifecycle Stage</option>
                      <option value="tags">Tags</option>
                    </optgroup>
                    {customFields.length > 0 && (
                      <optgroup label="Custom Fields">
                        {customFields.map((cf) => (
                          <option key={cf.id} value={`customField:${cf.id}`}>
                            {cf.inputName}{cf.isRequired ? " *" : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="skip">— Skip —</option>
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

      <div className="border-t border-gray-200 pt-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Batch settings</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lifecycle stage</label>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Add tags to all contacts</label>
            <TagInput tags={state.batchTags} onChange={(tags) => setState({ batchTags: tags })} />
          </div>
        </div>

        {groups.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Add to groups</label>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const selected = state.batchGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? state.batchGroupIds.filter((id) => id !== g.id)
                        : [...state.batchGroupIds, g.id];
                      setState({ batchGroupIds: next });
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {g.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.updateExisting}
            onChange={(e) => setState({ updateExisting: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">Update existing contacts with data from this CSV</span>
        </label>
      </div>

      {result && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 flex items-center gap-4 flex-wrap">
          <span><strong>{result.newContacts.toLocaleString()}</strong> new</span>
          <span className="text-gray-300">·</span>
          <span><strong>{result.duplicatesInCsv.toLocaleString()}</strong> duplicates in file</span>
          <span className="text-gray-300">·</span>
          <span>
            <strong>{result.existingInDb.toLocaleString()}</strong>{" "}
            {state.updateExisting ? "will update" : "will skip (existing)"}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={() => { setState({ analysisResult: null }); setError(null); prevStep(); }} disabled={analyzing || starting}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!hasAnalysis && (
            <Button onClick={() => { void handlePreview(); }} disabled={!!validationError || analyzing}>
              {analyzing ? "Analysing…" : "Preview"}
            </Button>
          )}
          {hasAnalysis && (
            <>
              <button
                type="button"
                onClick={() => { void handlePreview(); }}
                disabled={analyzing}
                className="text-sm text-brand-600 hover:underline disabled:opacity-50"
              >
                {analyzing ? "Re-analysing…" : "Re-analyse"}
              </button>
              <Button onClick={() => { void handleStartImport(); }} disabled={starting}>
                {starting ? "Starting…" : "Start Import"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
