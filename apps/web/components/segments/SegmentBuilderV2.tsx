"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Trash2, PlusCircle } from "lucide-react";
import { Dropdown, type DropdownOption } from "./Dropdown";
import type { FilterRule, FilterTab, FieldsRule, MatchMode, RowState, TagsRule } from "./types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

// ── Field config ──────────────────────────────────────────────────────────────

type FieldType = "text" | "date" | "boolean" | "status" | "user" | "group" | "customField";

interface FieldConfig { field: string; label: string; fieldType: FieldType }

const FIELD_CONFIGS: FieldConfig[] = [
  { field: "firstName",     label: "First Name",        fieldType: "text" },
  { field: "lastName",      label: "Last Name",         fieldType: "text" },
  { field: "email",         label: "Email",             fieldType: "text" },
  { field: "phoneNumber",   label: "Phone Number",      fieldType: "text" },
  { field: "leadStatusId",  label: "Status",            fieldType: "status" },
  { field: "createdAt",     label: "Creation Date",     fieldType: "date" },
  { field: "lastMessageAt", label: "Last Message Date", fieldType: "date" },
  { field: "whatsappOptOut", label: "WhatsApp Opt-out", fieldType: "boolean" },
  { field: "disableBot",    label: "Bot Disabled",      fieldType: "boolean" },
  { field: "countryCode",   label: "Country",           fieldType: "text" },
  { field: "languageCode",  label: "Language",          fieldType: "text" },
  { field: "assignedUserId", label: "Assigned User",   fieldType: "user" },
  { field: "groups",        label: "Groups",            fieldType: "group" },
];

const FIELD_OPTIONS: DropdownOption[] = FIELD_CONFIGS.map((f) => ({ value: f.field, label: f.label }));

function getFieldType(field: string): FieldType {
  return FIELD_CONFIGS.find((f) => f.field === field)?.fieldType ?? "text";
}

// ── Operator config ───────────────────────────────────────────────────────────

const TEXT_OPERATORS: DropdownOption[] = [
  { value: "is",             label: "Is" },
  { value: "isNot",          label: "Is not" },
  { value: "contains",       label: "Contains" },
  { value: "doesNotContain", label: "Does not contain" },
  { value: "isEmpty",        label: "Is empty" },
  { value: "hasAnyValue",    label: "Has any value" },
];

const DATE_OPERATORS: DropdownOption[] = [
  { value: "lessThanDaysAgo", label: "Less than X days ago" },
  { value: "moreThanDaysAgo", label: "More than X days ago" },
  { value: "after",           label: "After" },
  { value: "on",              label: "On" },
  { value: "before",          label: "Before" },
  { value: "isEmpty",         label: "Is empty" },
  { value: "hasAnyValue",     label: "Has any value" },
];

const BOOLEAN_OPERATORS: DropdownOption[] = [
  { value: "isTrue",      label: "Is true" },
  { value: "isFalse",     label: "Is false" },
  { value: "isEmpty",     label: "Is empty" },
  { value: "hasAnyValue", label: "Has any value" },
];

const STATUS_OPERATORS: DropdownOption[] = [{ value: "is", label: "Is" }];
const USER_GROUP_OPERATORS: DropdownOption[] = [
  { value: "is",      label: "Is" },
  { value: "isNot",   label: "Is not" },
  { value: "isEmpty", label: "Is empty" },
];

function getOperators(field: string): DropdownOption[] {
  const ft = getFieldType(field);
  switch (ft) {
    case "text":        return TEXT_OPERATORS;
    case "date":        return DATE_OPERATORS;
    case "boolean":     return BOOLEAN_OPERATORS;
    case "status":      return STATUS_OPERATORS;
    case "user":
    case "group":       return USER_GROUP_OPERATORS;
    case "customField": return TEXT_OPERATORS;
    default:            return TEXT_OPERATORS;
  }
}

function needsValue(field: string, operator: string): boolean {
  return !["isEmpty", "hasAnyValue", "isTrue", "isFalse"].includes(operator);
}

function isDateDaysOperator(operator: string): boolean {
  return operator === "lessThanDaysAgo" || operator === "moreThanDaysAgo";
}

function defaultRule(tab: FilterTab): FilterRule {
  if (tab === "tags") return { type: "tags", operator: "is", value: "" };
  if (tab === "events") return { type: "events", action: "hasDone", eventName: "", subConditions: [], subMatch: "and" };
  return { type: "fields", field: "firstName", operator: "is", value: "" };
}

function tabFromRule(rule: FilterRule): FilterTab {
  return rule.type as FilterTab;
}

// ── Tab switcher ──────────────────────────────────────────────────────────────

function TabSwitcher({ active, onChange }: { active: FilterTab; onChange: (t: FilterTab) => void }): JSX.Element {
  const tabs: FilterTab[] = ["tags", "fields", "events"];
  return (
    <div className="flex rounded-full border border-gray-200 bg-gray-50 p-0.5 w-fit">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-full px-4 py-1 text-sm font-medium transition-colors capitalize ${
            active === t
              ? "bg-[#1D4B3E] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── Tags row content ──────────────────────────────────────────────────────────

function TagsRowContent({
  rule,
  tags,
  onChange,
}: {
  rule: TagsRule;
  tags: DropdownOption[];
  onChange: (r: TagsRule) => void;
}): JSX.Element {
  const operatorOptions: DropdownOption[] = [
    { value: "is",    label: "Is" },
    { value: "isNot", label: "Is Not" },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Dropdown
        options={operatorOptions}
        value={rule.operator}
        onChange={(v) => onChange({ ...rule, operator: v as TagsRule["operator"] })}
        className="w-28"
      />
      <span className="text-gray-300 text-lg">·········</span>
      <Dropdown
        options={tags}
        value={rule.value}
        onChange={(v) => onChange({ ...rule, value: v })}
        placeholder="Select a Tag"
        searchable
        className="w-56"
      />
    </div>
  );
}

// ── Fields row content ────────────────────────────────────────────────────────

function FieldsRowContent({
  rule,
  customFields,
  leadStatuses,
  onChange,
}: {
  rule: FieldsRule;
  customFields: DropdownOption[];
  leadStatuses: DropdownOption[];
  onChange: (r: FieldsRule) => void;
}): JSX.Element {
  const allFieldOptions: DropdownOption[] = [
    ...FIELD_OPTIONS,
    ...customFields.map((cf) => ({ value: `customField:${cf.value}`, label: cf.label })),
  ];

  const fieldValue =
    rule.field === "customField" && rule.customFieldId
      ? `customField:${rule.customFieldId}`
      : rule.field;

  function handleFieldChange(raw: string): void {
    if (raw.startsWith("customField:")) {
      const customFieldId = raw.slice("customField:".length);
      onChange({ type: "fields", field: "customField", operator: "is", customFieldId, value: "" });
    } else {
      const ops = getOperators(raw);
      onChange({ type: "fields", field: raw, operator: ops[0]?.value ?? "is", value: "" });
    }
  }

  const operators = getOperators(rule.field);
  const ft = getFieldType(rule.field);
  const showValue = needsValue(rule.field, rule.operator);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Dropdown
        options={allFieldOptions}
        value={fieldValue}
        onChange={handleFieldChange}
        placeholder="Select a Field"
        className="w-48"
      />
      <span className="text-gray-300 text-lg">·········</span>
      <Dropdown
        options={operators}
        value={rule.operator}
        onChange={(v) => onChange({ ...rule, operator: v, value: "" })}
        className="w-44"
      />
      {showValue && (
        <>
          <span className="text-gray-300 text-lg">·········</span>
          {ft === "status" ? (
            <Dropdown
              options={leadStatuses}
              value={rule.value ?? ""}
              onChange={(v) => onChange({ ...rule, value: v })}
              placeholder="Select Status"
              className="w-48"
            />
          ) : ft === "date" && !isDateDaysOperator(rule.operator) ? (
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={rule.value ?? ""}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
            />
          ) : (
            <input
              type={isDateDaysOperator(rule.operator) ? "number" : "text"}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
              placeholder={isDateDaysOperator(rule.operator) ? "Days" : "Enter a value"}
              value={rule.value ?? ""}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
            />
          )}
          {isDateDaysOperator(rule.operator) && (
            <span className="text-sm text-gray-500">days ago</span>
          )}
        </>
      )}
    </div>
  );
}

// ── Events placeholder ────────────────────────────────────────────────────────

function EventsPlaceholder(): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-400 text-center">
      Event-based filtering coming soon
    </div>
  );
}

// ── Row connector (AND / OR) ──────────────────────────────────────────────────

function RowConnector({ match, onChange }: { match: MatchMode; onChange: (m: MatchMode) => void }): JSX.Element {
  return (
    <div className="flex items-center justify-start py-1 pl-4">
      <div className="flex items-center gap-px">
        <div className="w-px h-4 bg-gray-300" />
      </div>
      <Dropdown
        options={[{ value: "all", label: "AND" }, { value: "any", label: "OR" }]}
        value={match}
        onChange={(v) => onChange(v as MatchMode)}
        className="w-24 border-gray-200 text-xs"
      />
      <div className="w-px h-4 bg-gray-300" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SegmentBuilderV2Props {
  initial?: FilterRule[];
  match?: MatchMode;
  whatsappOptedOnly?: boolean;
  onChange: (filters: FilterRule[]) => void;
  onMatchChange?: (match: MatchMode) => void;
  onWhatsappOptedOnlyChange?: (value: boolean) => void;
}

export function SegmentBuilderV2({
  initial = [],
  match = "all",
  whatsappOptedOnly = false,
  onChange,
  onMatchChange,
  onWhatsappOptedOnlyChange,
}: SegmentBuilderV2Props): JSX.Element {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<RowState[]>(
    () => initial.map((rule) => ({ id: crypto.randomUUID(), tab: tabFromRule(rule), rule })),
  );
  const [tags, setTags] = useState<DropdownOption[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<DropdownOption[]>([]);
  const [customFields, setCustomFields] = useState<DropdownOption[]>([]);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token ?? ""}` };
      const [tagsRes, statusRes, cfRes] = await Promise.all([
        fetch(`${API_URL}/v1/contacts/tags`, { headers }),
        fetch(`${API_URL}/v1/contacts/lead-statuses`, { headers }),
        fetch(`${API_URL}/v1/contacts/custom-fields`, { headers }),
      ]);
      if (tagsRes.ok) {
        const body = (await tagsRes.json()) as { data: string[] };
        setTags(body.data.map((t) => ({ value: t, label: t })));
      }
      if (statusRes.ok) {
        const body = (await statusRes.json()) as { data: Array<{ id: string; name: string }> };
        setLeadStatuses(body.data.map((s) => ({ value: s.id, label: s.name })));
      }
      if (cfRes.ok) {
        const body = (await cfRes.json()) as { data: Array<{ id: string; inputName: string }> };
        setCustomFields(body.data.map((cf) => ({ value: cf.id, label: cf.inputName })));
      }
    })();
  }, [getToken]);

  useEffect(() => {
    setRows(initial.map((rule) => ({ id: crypto.randomUUID(), tab: tabFromRule(rule), rule })));
  }, [initial]);

  function updateRow(index: number, rule: FilterRule): void {
    const next = rows.map((r, i) => (i === index ? { ...r, rule } : r));
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  function changeTab(index: number, tab: FilterTab): void {
    const rule = defaultRule(tab);
    const next = rows.map((r, i) => (i === index ? { ...r, tab, rule } : r));
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  function addRow(): void {
    const rule = defaultRule("fields");
    const next = [...rows, { id: crypto.randomUUID(), tab: "fields" as FilterTab, rule }];
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  function removeRow(index: number): void {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-700 mb-3">Filter Contacts by</p>

      {rows.map((row, i) => (
        <div key={row.id}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 relative">
            {/* Delete */}
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="absolute top-3 right-3 text-red-400 hover:text-red-600"
              aria-label="Remove condition"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {/* Tab switcher */}
            <div className="mb-3">
              <TabSwitcher active={row.tab} onChange={(t) => changeTab(i, t)} />
            </div>

            {/* Row content */}
            {row.tab === "tags" && (
              <TagsRowContent
                rule={row.rule as TagsRule}
                tags={tags}
                onChange={(r) => updateRow(i, r)}
              />
            )}
            {row.tab === "fields" && (
              <FieldsRowContent
                rule={row.rule as FieldsRule}
                customFields={customFields}
                leadStatuses={leadStatuses}
                onChange={(r) => updateRow(i, r)}
              />
            )}
            {row.tab === "events" && <EventsPlaceholder />}
          </div>

          {/* Connector between rows */}
          {i < rows.length - 1 && (
            <RowConnector match={match} onChange={(m) => onMatchChange?.(m)} />
          )}
        </div>
      ))}

      {/* Add condition */}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-sm text-[#1D4B3E] hover:text-green-700 mt-3"
      >
        <PlusCircle className="h-5 w-5" />
        Add Condition
      </button>

      {/* WhatsApp opted toggle */}
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={whatsappOptedOnly}
          onClick={() => onWhatsappOptedOnlyChange?.(!whatsappOptedOnly)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
            whatsappOptedOnly ? "bg-[#1D4B3E]" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
              whatsappOptedOnly ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm text-gray-700">
          Only include customers whose &apos;WhatsApp opted&apos; is true
        </span>
        <span className="rounded-full bg-[#1D4B3E] px-2 py-0.5 text-xs font-medium text-white">
          Recommended
        </span>
      </div>
    </div>
  );
}
