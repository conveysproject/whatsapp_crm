"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface CustomField {
  id: string;
  inputName: string;
  fieldKey: string;
  inputType: string;
  description: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  options: string[];
  isRequired: boolean;
  isReadOnly: boolean;
  isActive: boolean;
  createdAt: string;
}

interface FieldFormState {
  inputName: string;
  fieldKey: string;
  fieldKeyTouched: boolean;
  inputType: string;
  description: string;
  placeholder: string;
  defaultValue: string;
  options: string[];
  optionDraft: string;
  isRequired: boolean;
  isReadOnly: boolean;
}

const EMPTY_FORM: FieldFormState = {
  inputName: "",
  fieldKey: "",
  fieldKeyTouched: false,
  inputType: "text",
  description: "",
  placeholder: "",
  defaultValue: "",
  options: [],
  optionDraft: "",
  isRequired: false,
  isReadOnly: false,
};

const INPUT_TYPES = [
  { value: "text",           label: "Text" },
  { value: "number",         label: "Number" },
  { value: "email",          label: "Email" },
  { value: "url",            label: "URL" },
  { value: "date",           label: "Date" },
  { value: "time",           label: "Time" },
  { value: "datetime-local", label: "Date and Time" },
  { value: "select",         label: "Select" },
  { value: "boolean",        label: "Boolean" },
] as const;

function toFieldKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
          checked ? "bg-brand-600" : "bg-gray-300",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

export default function CustomFieldsManager(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "manage_contacts");
  const queryClient = useQueryClient();

  // undefined = modal closed, null = add mode, CustomField = edit mode
  const [editingField, setEditingField] = useState<CustomField | null | undefined>(undefined);
  const [form, setForm] = useState<FieldFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["custom-fields-all"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields?all=1`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: CustomField[] }).data;
    },
  });

  // Auto-derive fieldKey from label unless user has manually edited it
  useEffect(() => {
    if (!form.fieldKeyTouched) {
      setForm((f) => ({ ...f, fieldKey: toFieldKey(f.inputName) }));
    }
  }, [form.inputName, form.fieldKeyTouched]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingField(null);
  }

  function openEdit(f: CustomField) {
    setForm({
      inputName: f.inputName,
      fieldKey: f.fieldKey,
      fieldKeyTouched: true,
      inputType: f.inputType,
      description: f.description ?? "",
      placeholder: f.placeholder ?? "",
      defaultValue: f.defaultValue ?? "",
      options: f.options,
      optionDraft: "",
      isRequired: f.isRequired,
      isReadOnly: f.isReadOnly,
    });
    setFormError(null);
    setEditingField(f);
  }

  function closeModal() {
    setEditingField(undefined);
  }

  function addOption() {
    const val = form.optionDraft.trim();
    if (!val || form.options.includes(val)) return;
    setForm((f) => ({ ...f, options: [...f.options, val], optionDraft: "" }));
  }

  function removeOption(opt: string) {
    setForm((f) => ({ ...f, options: f.options.filter((o) => o !== opt) }));
  }

  async function handleSave() {
    if (!form.inputName.trim()) { setFormError("Field label is required."); return; }
    if (!form.fieldKey.trim()) { setFormError("Field key is required."); return; }
    if (form.inputType === "select" && form.options.length === 0) {
      setFormError("Select fields require at least one option.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const token = await getToken();

    const payload = {
      inputName: form.inputName.trim(),
      fieldKey: form.fieldKey.trim(),
      inputType: form.inputType,
      description: form.description || undefined,
      placeholder: form.placeholder || undefined,
      defaultValue: form.defaultValue || undefined,
      options: form.options,
      isRequired: form.isRequired,
      isReadOnly: form.isReadOnly,
    };

    const isEdit = editingField !== null && editingField !== undefined;
    const url = isEdit
      ? `${API_URL}/v1/contacts/custom-fields/${editingField.id}`
      : `${API_URL}/v1/contacts/custom-fields`;

    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const json = await res.json() as { error?: { message: string } };
      setFormError(json.error?.message ?? "Failed to save field.");
      return;
    }
    closeModal();
    void queryClient.invalidateQueries({ queryKey: ["custom-fields-all"] });
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  async function handleToggleActive(f: CustomField) {
    setTogglingId(f.id);
    const token = await getToken();
    await fetch(`${API_URL}/v1/contacts/custom-fields/${f.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !f.isActive }),
    });
    setTogglingId(null);
    void queryClient.invalidateQueries({ queryKey: ["custom-fields-all"] });
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom Fields</p>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
          >
            Add Field
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading…</p>
        ) : fields.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No custom fields yet.</p>
        ) : (
          fields.map((f) => (
            <div
              key={f.id}
              className={["flex items-center gap-4 px-4 py-3", !f.isActive ? "opacity-50" : ""].join(" ")}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{f.inputName}</span>
                  <code className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                    {f.fieldKey}
                  </code>
                  {f.isRequired && (
                    <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                  {f.isReadOnly && (
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded">
                      Read Only
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {INPUT_TYPES.find((t) => t.value === f.inputType)?.label ?? f.inputType}
                  {f.options.length > 0 ? ` · ${f.options.join(", ")}` : ""}
                  {f.description ? ` · ${f.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {canManage && (
                  <Toggle
                    checked={f.isActive}
                    onChange={() => { if (!togglingId) void handleToggleActive(f); }}
                    label=""
                  />
                )}
                {canManage && (
                  <button
                    onClick={() => openEdit(f)}
                    className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Modal */}
      {editingField !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingField === null ? "Add Custom Field" : "Edit Custom Field"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Label + Key */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">
                    Field Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputCls}
                    placeholder="e.g. Company Size"
                    value={form.inputName}
                    onChange={(e) => setForm((f) => ({ ...f, inputName: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">
                    Field Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputCls}
                    placeholder="company_size"
                    value={form.fieldKey}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fieldKey: e.target.value, fieldKeyTouched: true }))
                    }
                  />
                  <p className="text-xs text-gray-400">Auto-generated · unique per org</p>
                </div>
              </div>

              {/* Type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Field Type</label>
                <select
                  className={inputCls}
                  value={form.inputType}
                  onChange={(e) => setForm((f) => ({ ...f, inputType: e.target.value }))}
                >
                  {INPUT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Options — only shown for Select type */}
              {form.inputType === "select" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-700">
                    Options <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      className={inputCls}
                      placeholder="Add option and press Enter"
                      value={form.optionDraft}
                      onChange={(e) => setForm((f) => ({ ...f, optionDraft: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                    />
                    <button
                      type="button"
                      onClick={addOption}
                      className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  {form.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.options.map((opt) => (
                        <span
                          key={opt}
                          className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs px-2.5 py-1"
                        >
                          {opt}
                          <button
                            type="button"
                            onClick={() => removeOption(opt)}
                            className="hover:text-brand-900 leading-none"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Description / Help Text</label>
                <input
                  className={inputCls}
                  placeholder="Guidance shown below the field"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Placeholder + Default Value — hidden for boolean */}
              {form.inputType !== "boolean" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Placeholder</label>
                    <input
                      className={inputCls}
                      placeholder="e.g. Enter value…"
                      value={form.placeholder}
                      onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Default Value</label>
                    {form.inputType === "select" ? (
                      <select
                        className={inputCls}
                        value={form.defaultValue}
                        onChange={(e) => setForm((f) => ({ ...f, defaultValue: e.target.value }))}
                      >
                        <option value="">None</option>
                        {form.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputCls}
                        placeholder="Pre-filled value"
                        value={form.defaultValue}
                        onChange={(e) => setForm((f) => ({ ...f, defaultValue: e.target.value }))}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Required + Read Only */}
              <div className="flex flex-col gap-3 pt-1">
                <Toggle
                  checked={form.isRequired}
                  onChange={(v) => setForm((f) => ({ ...f, isRequired: v }))}
                  label="Required — contact cannot be saved without this field"
                />
                <Toggle
                  checked={form.isReadOnly}
                  onChange={(v) => setForm((f) => ({ ...f, isReadOnly: v }))}
                  label="Read Only — visible but not editable in the form"
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSave(); }}
                disabled={saving}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Field"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
