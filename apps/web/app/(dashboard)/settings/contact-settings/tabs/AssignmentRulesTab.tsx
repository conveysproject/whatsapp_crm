"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-fetch";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const TRIGGERS = [
  { value: "contact_created", label: "New Contact Created via WA DM" },
  { value: "trait_tag_updated", label: "Trait or Tag Updated" },
] as const;

type FieldType = "text" | "number" | "date" | "boolean" | "select";

const STATIC_FIELDS: { value: string; label: string; type: FieldType }[] = [
  { value: "firstName",    label: "First Name",    type: "text" },
  { value: "lastName",     label: "Last Name",     type: "text" },
  { value: "email",        label: "Email",         type: "text" },
  { value: "phoneNumber",  label: "Phone Number",  type: "text" },
  { value: "leadStatusId", label: "Lead Status",   type: "select" },
  { value: "countryCode",  label: "Country Code",  type: "text" },
  { value: "languageCode", label: "Language",      type: "text" },
];

const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
  text:    [{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }, { value: "contains", label: "contains" }, { value: "startsWith", label: "starts with" }],
  number:  [{ value: "equals", label: "equals" }, { value: "isNot", label: "is not" }, { value: "gt", label: "greater than" }, { value: "lt", label: "less than" }],
  date:    [{ value: "before", label: "before" }, { value: "after", label: "after" }, { value: "equals", label: "on" }],
  boolean: [{ value: "isTrue", label: "is true" }, { value: "isFalse", label: "is false" }],
  select:  [{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }],
};

interface CustomFieldOpt { id: string; inputName: string; fieldKey: string; inputType: string }
interface Condition { kind: "field" | "tags"; field?: string; operator: string; value: string }
interface Rule {
  id: string;
  name: string;
  trigger: string;
  conditions: Condition[];
  assignType: "user" | "team";
  assignTo: string;
  replacePrevious: boolean;
}
interface UserOpt { id: string; fullName: string | null; email: string }
interface TeamOpt { id: string; name: string }

type Draft = Omit<Rule, "id"> & { id?: string };
const EMPTY_DRAFT: Draft = { name: "", trigger: "contact_created", conditions: [], assignType: "user", assignTo: "", replacePrevious: false };

export default function AssignmentRulesTab(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Draft | undefined>(undefined);

  async function authed(path: string, init?: RequestInit) {
    const token = await getToken();
    return clientFetch(`${API_URL}${path}`, { ...init, token: token ?? "", headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined ?? {}) } });
  }

  const { data: rules = [] } = useQuery<Rule[]>({
    queryKey: ["assignment-rules"],
    queryFn: async () => (await (await authed("/v1/contact-assignment-rules")).json() as { data: Rule[] }).data ?? [],
  });
  const { data: users = [] } = useQuery<UserOpt[]>({
    queryKey: ["users-list"],
    queryFn: async () => (await (await authed("/v1/users")).json() as { data: UserOpt[] }).data ?? [],
  });
  const { data: teams = [] } = useQuery<TeamOpt[]>({
    queryKey: ["teams-list"],
    queryFn: async () => (await (await authed("/v1/teams")).json() as { data: TeamOpt[] }).data ?? [],
  });
  const { data: customFields = [] } = useQuery<CustomFieldOpt[]>({
    queryKey: ["custom-fields"],
    queryFn: async () => (await (await authed("/v1/contacts/custom-fields")).json() as { data: CustomFieldOpt[] }).data ?? [],
  });
  const { data: fallbackEnabled = false } = useQuery<boolean>({
    queryKey: ["assignment-fallback"],
    queryFn: async () => {
      const json = (await (await authed("/v1/organizations/me")).json()) as { data?: { settings?: { contactConfig?: { assignmentFallbackEnabled?: boolean } } } };
      return json.data?.settings?.contactConfig?.assignmentFallbackEnabled ?? false;
    },
  });

  const save = useMutation({
    mutationFn: async (draft: Draft) => {
      const body = JSON.stringify(draft);
      const res = draft.id
        ? await authed(`/v1/contact-assignment-rules/${draft.id}`, { method: "PATCH", body })
        : await authed("/v1/contact-assignment-rules", { method: "POST", body });
      if (!res.ok) throw new Error("Failed to save rule");
    },
    onSuccess: () => { setEditing(undefined); void qc.invalidateQueries({ queryKey: ["assignment-rules"] }); },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await authed(`/v1/contact-assignment-rules/${id}`, { method: "DELETE" }); },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["assignment-rules"] }),
  });
  const toggleFallback = useMutation({
    mutationFn: async (enabled: boolean) => {
      await authed("/v1/organizations/me", { method: "PATCH", body: JSON.stringify({ settings: { contactConfig: { assignmentFallbackEnabled: enabled } } }) });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["assignment-fallback"] }),
  });

  function assigneeLabel(r: Rule): string {
    if (r.assignType === "team") return teams.find((t) => t.id === r.assignTo)?.name ?? "Team";
    const u = users.find((x) => x.id === r.assignTo);
    return u ? (u.fullName ?? u.email) : "Agent";
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
        Account Owner auto-assignment runs Custom Rules first. If none apply, the Fallback Rule is used when enabled.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom Rules</p>
          <button onClick={() => setEditing(EMPTY_DRAFT)} className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">Add Rule</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {["Rule Name", "Trigger", "Fields", "Fields Value", "Assignment Type", "Assignees"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rules.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-sm text-gray-400 text-center">No rules yet. Click &quot;Add Rule&quot; to create one.</td></tr>
            ) : rules.map((r) => {
              const conds = r.conditions as Condition[];
              const firstField = conds.find((c) => c.kind === "field");
              const firstTag  = conds.find((c) => c.kind === "tags");
              const fieldLabel = firstField
                ? (STATIC_FIELDS.find((f) => f.value === firstField.field)?.label ?? firstField.field ?? "—")
                : firstTag ? "Tags" : "—";
              const fieldValue = firstField?.value ?? firstTag?.value ?? "—";
              return (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{TRIGGERS.find((t) => t.value === r.trigger)?.label ?? r.trigger}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fieldLabel}{conds.length > 1 ? <span className="ml-1 text-xs text-gray-400">+{conds.length - 1}</span> : null}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fieldValue}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.assignType === "team" ? "Team" : "Agent"}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{assigneeLabel(r)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setEditing({ ...r })} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
                      <button onClick={() => remove.mutate(r.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">Fallback Rule</p>
          <p className="text-xs text-gray-500">Auto-assign new contacts to active agents via workload balancing when no custom rule matches.</p>
        </div>
        <button
          type="button"
          onClick={() => toggleFallback.mutate(!fallbackEnabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fallbackEnabled ? "bg-emerald-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${fallbackEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {editing !== undefined && (
        <RuleSlideOver
          initial={editing}
          users={users}
          teams={teams}
          customFields={customFields}
          saving={save.isPending}
          onSave={(d) => save.mutate(d)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function RuleSlideOver({
  initial, users, teams, customFields, saving, onSave, onClose,
}: {
  initial: Draft; users: UserOpt[]; teams: TeamOpt[]; customFields: CustomFieldOpt[]; saving: boolean;
  onSave: (d: Draft) => void; onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<Draft>(initial);
  useEffect(() => setDraft(initial), [initial]);

  // All fields: static + custom
  const allFields = [
    ...STATIC_FIELDS,
    ...customFields.map((cf) => ({
      value: `custom:${cf.fieldKey}`,
      label: cf.inputName,
      type: (["number", "date", "boolean", "select"].includes(cf.inputType) ? cf.inputType : "text") as FieldType,
    })),
  ];

  function fieldType(fieldValue: string | undefined): FieldType {
    return allFields.find((f) => f.value === fieldValue)?.type ?? "text";
  }
  function defaultOperator(type: FieldType): string {
    return OPERATORS_BY_TYPE[type][0]?.value ?? "equals";
  }

  function patch(p: Partial<Draft>) { setDraft((d) => ({ ...d, ...p })); }
  function addCondition() { patch({ conditions: [...draft.conditions, { kind: "field", field: allFields[0]?.value ?? "firstName", operator: defaultOperator(fieldType(allFields[0]?.value)), value: "" }] }); }
  function setCondition(i: number, c: Condition) { patch({ conditions: draft.conditions.map((x, j) => (j === i ? c : x)) }); }
  function removeCondition(i: number) { patch({ conditions: draft.conditions.filter((_, j) => j !== i) }); }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{draft.id ? "Edit Rule" : "Create Custom Rule"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Rule Name</label>
            <input className={inputCls} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Enter rule name" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">If</label>
            <select className={inputCls} value={draft.trigger} onChange={(e) => patch({ trigger: e.target.value })}>
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            {draft.conditions.map((c, i) => {
              const type = c.kind === "field" ? fieldType(c.field) : "text";
              const operators = c.kind === "field" ? (OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.text) : [];
              return (
                <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={c.kind === "field"} onChange={() => setCondition(i, { kind: "field", field: allFields[0]?.value ?? "firstName", operator: defaultOperator(fieldType(allFields[0]?.value)), value: "" })} />
                        Field
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={c.kind === "tags"} onChange={() => setCondition(i, { kind: "tags", operator: "is", value: "" })} />
                        Tags
                      </label>
                    </div>
                    <button onClick={() => removeCondition(i)} className="text-gray-400 hover:text-red-500 text-lg leading-none">&times;</button>
                  </div>

                  {c.kind === "field" ? (
                    <div className="space-y-2">
                      {/* Field selector */}
                      <select
                        className={inputCls}
                        value={c.field ?? ""}
                        onChange={(e) => {
                          const newType = fieldType(e.target.value);
                          setCondition(i, { ...c, field: e.target.value, operator: defaultOperator(newType), value: "" });
                        }}
                      >
                        <optgroup label="Contact Fields">
                          {STATIC_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </optgroup>
                        {customFields.length > 0 && (
                          <optgroup label="Custom Fields">
                            {customFields.map((cf) => <option key={cf.fieldKey} value={`custom:${cf.fieldKey}`}>{cf.inputName}</option>)}
                          </optgroup>
                        )}
                      </select>
                      {/* Operator — hidden for boolean (value implied by operator itself) */}
                      {type !== "boolean" && (
                        <select className={inputCls} value={c.operator} onChange={(e) => setCondition(i, { ...c, operator: e.target.value })}>
                          {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                      )}
                      {/* Value input — hidden for boolean */}
                      {type !== "boolean" && (
                        <input
                          className={inputCls}
                          type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                          value={c.value}
                          onChange={(e) => setCondition(i, { ...c, value: e.target.value })}
                          placeholder="Value"
                        />
                      )}
                      {/* Boolean: operator IS the value selection */}
                      {type === "boolean" && (
                        <select className={inputCls} value={c.operator} onChange={(e) => setCondition(i, { ...c, operator: e.target.value })}>
                          {operators.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                      )}
                    </div>
                  ) : (
                    /* Tags: fixed "is" label + tag value input */
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 shrink-0">is</span>
                      <input className={inputCls} value={c.value} onChange={(e) => setCondition(i, { ...c, operator: "is", value: e.target.value })} placeholder="Tag value" />
                    </div>
                  )}
                </div>
              );
            })}
            {draft.conditions.length === 0 && (
              <button onClick={addCondition} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium">+ Add Condition</button>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Then Assign</label>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={draft.assignType === "user"} onChange={() => patch({ assignType: "user", assignTo: "" })} /> Specific Agent</label>
              <label className="flex items-center gap-1"><input type="radio" checked={draft.assignType === "team"} onChange={() => patch({ assignType: "team", assignTo: "" })} /> Specific Team</label>
            </div>
            <select className={inputCls} value={draft.assignTo} onChange={(e) => patch({ assignTo: e.target.value })}>
              <option value="">{draft.assignType === "team" ? "— Select team —" : "— Select agent —"}</option>
              {draft.assignType === "team"
                ? teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)
                : users.map((u) => <option key={u.id} value={u.id}>{u.fullName ?? u.email}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={draft.replacePrevious} onChange={(e) => patch({ replacePrevious: e.target.checked })} />
            Replace Previously Assigned Account Owner
          </label>
        </div>

        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onSave(draft)}
            disabled={saving || !draft.name.trim() || !draft.assignTo}
            className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
