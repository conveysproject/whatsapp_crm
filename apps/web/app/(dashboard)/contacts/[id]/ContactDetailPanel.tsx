"use client";

import { JSX, useState } from "react";
import { ContactTimeline } from "./ContactTimeline";
import { AiSummaryCard } from "./AiSummaryCard";
import { ContactDealsTab } from "./ContactDealsTab";

type Tab = "timeline" | "summary" | "deals";

const TABS: { id: Tab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "summary",  label: "AI Summary" },
  { id: "deals",    label: "Deals" },
];

interface Props {
  contactId: string;
  contactName: string;
  initialSummary: string | null;
}

export function ContactDetailPanel({ contactId, contactName, initialSummary }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>("timeline");

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — always mounted to preserve internal state */}
      <div className={tab === "timeline" ? undefined : "hidden"}>
        <ContactTimeline contactId={contactId} />
      </div>
      <div className={tab === "summary" ? undefined : "hidden"}>
        <AiSummaryCard contactId={contactId} initialSummary={initialSummary} />
      </div>
      <div className={tab === "deals" ? undefined : "hidden"}>
        <ContactDealsTab contactId={contactId} contactName={contactName} />
      </div>
    </div>
  );
}
