"use client";

import { JSX } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DateRangeSelector } from "./DateRangeSelector";
import { ExportButton } from "./ExportButton";
import { OverviewTab } from "./OverviewTab";
import { ConversationsTab } from "./ConversationsTab";
import { TeamTab } from "./TeamTab";
import { CampaignsTab } from "./CampaignsTab";
import { PredictiveTab } from "./PredictiveTab";

type Tab = "overview" | "conversations" | "team" | "campaigns" | "predictive";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",      label: "Overview" },
  { id: "conversations", label: "Conversations" },
  { id: "team",          label: "Team" },
  { id: "campaigns",     label: "Campaigns" },
  { id: "predictive",    label: "Predictive" },
];

const VALID_DAYS = [7, 14, 30, 90];

export function AnalyticsShell(): JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get("tab") ?? "overview";
  const tab: Tab = (["overview", "conversations", "team", "campaigns", "predictive"].includes(rawTab)
    ? rawTab
    : "overview") as Tab;

  const rawDays = parseInt(searchParams.get("days") ?? "30", 10);
  const days = VALID_DAYS.includes(rawDays) ? rawDays : 30;

  function setTab(newTab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", newTab);
    router.replace(`/analytics?${params.toString()}`);
  }

  function setDays(newDays: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("days", String(newDays));
    router.replace(`/analytics?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <ExportButton tab={tab} days={days} disabled={tab === "predictive"} />
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); }}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                tab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Date range selector (hidden on Predictive tab) */}
      {tab !== "predictive" && (
        <DateRangeSelector days={days} onChange={setDays} />
      )}

      {/* Active tab content */}
      {tab === "overview"      && <OverviewTab days={days} />}
      {tab === "conversations" && <ConversationsTab days={days} />}
      {tab === "team"          && <TeamTab days={days} />}
      {tab === "campaigns"     && <CampaignsTab days={days} />}
      {tab === "predictive"    && <PredictiveTab />}
    </div>
  );
}
