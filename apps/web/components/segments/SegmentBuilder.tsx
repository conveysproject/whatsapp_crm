"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

// ── Types ────────────────────────────────────────────────────────────────────

export type MatchMode = "all" | "any";

export type FilterRule =
  | { field: "firstName" | "lastName" | "email" | "phoneNumber"; operator: "contains" | "equals" | "startsWith" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }
  | { field: "tags"; operator: "contains" | "doesNotContain"; value: string }
  | { field: "countryCode" | "languageCode"; operator: "equals" | "isNot"; value: string }
  | { field: "companyName"; operator: "contains" | "equals" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "assignedUserId"; operator: "equals" | "isNot" | "isEmpty"; value?: string }
  | { field: "groups"; operator: "memberOf" | "notMemberOf"; value: string }
  | { field: "whatsappOptOut" | "disableBot"; operator: "isTrue" | "isFalse" }
  | { field: "createdAt" | "lastMessageAt"; operator: "after" | "before" | "between"; value: string; valueTo?: string }
  | { field: "customField"; operator: "contains" | "equals" | "isEmpty"; customFieldId: string; value?: string };

type RuleEntry = { id: string; rule: FilterRule };

// ── Field groups ─────────────────────────────────────────────────────────────

interface FieldOption { value: string; label: string }
interface FieldGroup { label: string; fields: FieldOption[] }

const STATIC_FIELD_GROUPS: FieldGroup[] = [
  { label: "Identity", fields: [
    { value: "firstName", label: "First name" },
    { value: "lastName", label: "Last name" },
    { value: "email", label: "Email" },
    { value: "phoneNumber", label: "Phone number" },
  ]},
  { label: "Status", fields: [
    { value: "lifecycleStage", label: "Lifecycle stage" },
    { value: "whatsappOptOut", label: "WhatsApp opt-out" },
    { value: "disableBot", label: "Bot disabled" },
  ]},
  { label: "Geography", fields: [
    { value: "countryCode", label: "Country" },
    { value: "languageCode", label: "Language" },
  ]},
  { label: "Organization", fields: [
    { value: "companyName", label: "Company" },
    { value: "assignedUserId", label: "Assigned user" },
    { value: "groups", label: "Groups" },
  ]},
  { label: "Engagement", fields: [
    { value: "createdAt", label: "Created date" },
    { value: "lastMessageAt", label: "Last message date" },
  ]},
  { label: "Tags", fields: [
    { value: "tags", label: "Tags" },
  ]},
];

// ── Operator config ──────────────────────────────────────────────────────────

interface OperatorOption { value: string; label: string }

function getOperators(field: string): OperatorOption[] {
  if (["firstName", "lastName", "email", "phoneNumber"].includes(field))
    return [
      { value: "contains", label: "contains" },
      { value: "equals", label: "equals" },
      { value: "startsWith", label: "starts with" },
      { value: "isEmpty", label: "is empty" },
      { value: "isNotEmpty", label: "is not empty" },
    ];
  if (field === "lifecycleStage")
    return [{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }];
  if (field === "tags")
    return [{ value: "contains", label: "contains" }, { value: "doesNotContain", label: "does not contain" }];
  if (["countryCode", "languageCode"].includes(field))
    return [{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }];
  if (field === "companyName")
    return [
      { value: "contains", label: "contains" },
      { value: "equals", label: "equals" },
      { value: "isEmpty", label: "is empty" },
      { value: "isNotEmpty", label: "is not empty" },
    ];
  if (field === "assignedUserId")
    return [
      { value: "equals", label: "is" },
      { value: "isNot", label: "is not" },
      { value: "isEmpty", label: "is empty" },
    ];
  if (field === "groups")
    return [
      { value: "memberOf", label: "is member of" },
      { value: "notMemberOf", label: "is not member of" },
    ];
  if (["whatsappOptOut", "disableBot"].includes(field))
    return [{ value: "isTrue", label: "is true" }, { value: "isFalse", label: "is false" }];
  if (["createdAt", "lastMessageAt"].includes(field))
    return [
      { value: "after", label: "after" },
      { value: "before", label: "before" },
      { value: "between", label: "between" },
    ];
  // customField fallback
  return [
    { value: "contains", label: "contains" },
    { value: "equals", label: "equals" },
    { value: "isEmpty", label: "is empty" },
  ];
}

function needsValue(operator: string): boolean {
  return !["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(operator);
}

function defaultRuleForField(field: string): FilterRule {
  const op = getOperators(field)[0].value;
  if (["whatsappOptOut", "disableBot"].includes(field))
    return { field: field as "whatsappOptOut" | "disableBot", operator: op as "isTrue" | "isFalse" };
  if (field === "lifecycleStage")
    return { field: "lifecycleStage", operator: "equals", value: "lead" };
  if (field === "customField")
    return { field: "customField", operator: "contains", customFieldId: "", value: "" };
  if (["createdAt", "lastMessageAt"].includes(field))
    return { field: field as "createdAt" | "lastMessageAt", operator: "after", value: "" };
  return { field: field as "firstName", operator: op as "contains", value: "" };
}

// ── Value input ──────────────────────────────────────────────────────────────

const selectClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
const inputClass = "flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function ValueInput({
  rule,
  customFields,
  onChange,
}: {
  rule: FilterRule;
  customFields: Array<{ id: string; inputName: string }>;
  onChange: (patch: Partial<FilterRule>) => void;
}): JSX.Element | null {
  if (!needsValue(rule.operator)) return null;

  if (rule.field === "lifecycleStage") {
    return (
      <select
        className={selectClass}
        value={rule.value}
        onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
      >
        {["lead", "prospect", "customer", "loyal", "churned"].map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
    );
  }

  if (["createdAt", "lastMessageAt"].includes(rule.field)) {
    const dateRule = rule as { field: string; operator: string; value: string; valueTo?: string };
    return (
      <div className="flex items-center gap-1 flex-1">
        <input
          type="date"
          className={inputClass}
          value={dateRule.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
        />
        {dateRule.operator === "between" && (
          <>
            <span className="text-xs text-gray-500">and</span>
            <input
              type="date"
              className={inputClass}
              value={dateRule.valueTo ?? ""}
              onChange={(e) => onChange({ valueTo: e.target.value } as Partial<FilterRule>)}
            />
          </>
        )}
      </div>
    );
  }

  if (rule.field === "customField") {
    const cf = rule as { field: "customField"; operator: string; customFieldId: string; value?: string };
    return (
      <div className="flex gap-1 flex-1">
        <select
          className={selectClass}
          value={cf.customFieldId}
          onChange={(e) => onChange({ customFieldId: e.target.value } as Partial<FilterRule>)}
        >
          <option value="">Select field…</option>
          {customFields.map((f) => (
            <option key={f.id} value={f.id}>{f.inputName}</option>
          ))}
        </select>
        {cf.operator !== "isEmpty" && (
          <input
            className={inputClass}
            value={cf.value ?? ""}
            onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
            placeholder="Value"
          />
        )}
      </div>
    );
  }

  const textRule = rule as { field: string; operator: string; value?: string };
  return (
    <input
      className={inputClass}
      value={textRule.value ?? ""}
      onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
      placeholder="Value"
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface SegmentBuilderProps {
  initial?: FilterRule[];
  match?: MatchMode;
  onChange: (filters: FilterRule[]) => void;
  onMatchChange?: (match: MatchMode) => void;
}

export function SegmentBuilder({
  initial = [],
  match = "all",
  onChange,
  onMatchChange,
}: SegmentBuilderProps): JSX.Element {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<RuleEntry[]>(
    () => initial.map((rule) => ({ id: crypto.randomUUID(), rule }))
  );
  const [customFields, setCustomFields] = useState<Array<{ id: string; inputName: string }>>([]);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { data: Array<{ id: string; inputName: string }> };
        setCustomFields(body.data);
      }
    })();
  }, [getToken]);

  useEffect(() => {
    setEntries(initial.map((rule) => ({ id: crypto.randomUUID(), rule })));
  }, [initial]);

  // Custom fields use "customField:<id>" as option value so each is selectable independently
  const fieldGroups: FieldGroup[] =
    customFields.length > 0
      ? [...STATIC_FIELD_GROUPS, { label: "Custom Fields", fields: customFields.map((cf) => ({ value: `customField:${cf.id}`, label: cf.inputName })) }]
      : STATIC_FIELD_GROUPS;

  function update(index: number, patch: Partial<FilterRule>) {
    const next = entries.map((e, i) =>
      i === index ? { ...e, rule: { ...e.rule, ...patch } as FilterRule } : e
    );
    setEntries(next);
    onChange(next.map((e) => e.rule));
  }

  function changeField(index: number, rawField: string) {
    let rule: FilterRule;
    if (rawField.startsWith("customField:")) {
      const customFieldId = rawField.slice("customField:".length);
      rule = { field: "customField", operator: "contains", customFieldId, value: "" };
    } else {
      rule = defaultRuleForField(rawField);
    }
    const next = entries.map((e, i) => (i === index ? { ...e, rule } : e));
    setEntries(next);
    onChange(next.map((e) => e.rule));
  }

  function addRule() {
    const next = [
      ...entries,
      { id: crypto.randomUUID(), rule: { field: "lifecycleStage", operator: "equals", value: "lead" } as FilterRule },
    ];
    setEntries(next);
    onChange(next.map((e) => e.rule));
  }

  function removeRule(index: number) {
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    onChange(next.map((e) => e.rule));
  }

  return (
    <div className="space-y-4">
      {/* Match toggle */}
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span>Contacts match</span>
        <select
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={match}
          onChange={(e) => onMatchChange?.(e.target.value as MatchMode)}
        >
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span>of the following rules</span>
      </div>

      {/* Rules */}
      {entries.map((entry, i) => {
        const rule = entry.rule;
        const ops = getOperators(rule.field);
        return (
          <div key={entry.id} className="flex items-center gap-2">
            {/* Field grouped dropdown — custom fields use "customField:<id>" as their option value */}
            <select
              className={selectClass}
              value={
                rule.field === "customField"
                  ? `customField:${(rule as { field: "customField"; customFieldId: string }).customFieldId}`
                  : rule.field
              }
              onChange={(e) => changeField(i, e.target.value)}
            >
              {fieldGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.fields.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Operator — rule.field is always the canonical type literal (e.g. "customField"), not the dropdown value */}
            <select
              className={selectClass}
              value={rule.operator}
              onChange={(e) => update(i, { operator: e.target.value } as Partial<FilterRule>)}
            >
              {ops.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Value */}
            <ValueInput rule={rule} customFields={customFields} onChange={(patch) => update(i, patch)} />

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeRule(i)}
              className="text-red-500 hover:text-red-700 text-lg px-1 leading-none"
              aria-label="Remove rule"
            >
              ×
            </button>
          </div>
        );
      })}

      <Button variant="secondary" size="sm" type="button" onClick={addRule}>
        + Add Filter
      </Button>
    </div>
  );
}
