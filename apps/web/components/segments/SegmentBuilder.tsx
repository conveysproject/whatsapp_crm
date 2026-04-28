"use client";

import { JSX, useState } from "react";
import { Button } from "@/components/ui/Button";

type FilterField = "lifecycleStage" | "tags" | "createdAt";
type FilterOperator = "equals" | "contains" | "after" | "before";

interface FilterRule {
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

interface SegmentBuilderProps {
  initial?: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

const FIELD_OPTIONS: Array<{ value: FilterField; label: string }> = [
  { value: "lifecycleStage", label: "Lifecycle Stage" },
  { value: "tags", label: "Tag" },
  { value: "createdAt", label: "Created Date" },
];

const OPERATOR_OPTIONS: Record<FilterField, Array<{ value: FilterOperator; label: string }>> = {
  lifecycleStage: [{ value: "equals", label: "is" }],
  tags: [{ value: "contains", label: "contains" }],
  createdAt: [{ value: "after", label: "after" }, { value: "before", label: "before" }],
};

export function SegmentBuilder({ initial = [], onChange }: SegmentBuilderProps): JSX.Element {
  const [rules, setRules] = useState<FilterRule[]>(initial);

  function update(index: number, patch: Partial<FilterRule>) {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRules(next);
    onChange(next);
  }

  function addRule() {
    const next = [
      ...rules,
      { field: "lifecycleStage" as FilterField, operator: "equals" as FilterOperator, value: "lead" },
    ];
    setRules(next);
    onChange(next);
  }

  function removeRule(index: number) {
    const next = rules.filter((_, i) => i !== index);
    setRules(next);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={rule.field}
            onChange={(e) =>
              update(i, {
                field: e.target.value as FilterField,
                operator: OPERATOR_OPTIONS[e.target.value as FilterField][0].value,
                value: "",
              })
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {FIELD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={rule.operator}
            onChange={(e) => update(i, { operator: e.target.value as FilterOperator })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {OPERATOR_OPTIONS[rule.field].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={rule.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Value"
          />
          <button
            type="button"
            onClick={() => removeRule(i)}
            className="text-red-500 hover:text-red-700 text-sm px-2"
          >
            ×
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" type="button" onClick={addRule}>
        + Add Filter
      </Button>
    </div>
  );
}
