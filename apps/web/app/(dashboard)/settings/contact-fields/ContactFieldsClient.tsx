"use client";

import { JSX } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import FieldsTab from "./tabs/FieldsTab";
import ComingSoon from "./tabs/ComingSoon";

const TABS = [
  { key: "lead-statuses", label: "Lead Statuses" },
  { key: "fields", label: "Fields" },
  { key: "basic-config", label: "Basic Configuration" },
  { key: "assignment-rules", label: "Account Owner Assignment Rules" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export function ContactFieldsClient(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const active: TabKey = isTabKey(raw) ? raw : "fields";

  function selectTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={[
              "pb-3 text-sm font-medium border-b-2 transition-colors -mb-px",
              active === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "fields" ? <FieldsTab /> : <ComingSoon label={TABS.find((t) => t.key === active)!.label} />}
    </div>
  );
}
