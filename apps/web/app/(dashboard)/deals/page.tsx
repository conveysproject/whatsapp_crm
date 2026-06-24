"use client";
import { JSX, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { KanbanBoard } from "@/components/deals/KanbanBoard";
import { DealSlideOver } from "@/components/deals/DealSlideOver";
import { CreatePipelineModal } from "@/components/deals/CreatePipelineModal";
import { AddDealModal } from "@/components/deals/AddDealModal";
import type { Deal } from "@/components/deals/DealCard";
import { PermissionGate } from "@/components/PermissionGate";

interface Pipeline {
  id: string;
  name: string;
  stages: string[];
}

export default function DealsPage(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);

  async function authFetch(url: string) {
    const token = await getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ""}` } });
    return res.json() as Promise<unknown>;
  }

  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery<{ data: Pipeline[] }>({
    queryKey: ["pipelines"],
    queryFn: () => authFetch(`${api}/v1/pipelines`) as Promise<{ data: Pipeline[] }>,
  });

  const pipelines = pipelinesData?.data ?? [];
  const pipeline = pipelines.find((p) => p.id === activePipelineId) ?? pipelines[0] ?? null;

  const { data: dealsData } = useQuery<{ data: Deal[] }>({
    queryKey: ["deals", pipeline?.id],
    queryFn: () => authFetch(`${api}/v1/deals?pipelineId=${pipeline?.id ?? ""}`) as Promise<{ data: Deal[] }>,
    enabled: !!pipeline,
  });

  const deals = dealsData?.data ?? [];

  const stages = Array.isArray(pipeline?.stages)
    ? (pipeline.stages as string[])
    : ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["deals"] });
  }

  if (pipelinesLoading) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        <div className="flex gap-4 overflow-x-auto pb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-3 min-w-60 w-60 flex-shrink-0">
              <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="flex flex-col gap-2 min-h-40 bg-gray-50 rounded-xl p-2 border border-gray-200">
                {[1, 2].map((j) => (
                  <div key={j} className="h-16 bg-gray-200 rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-600 font-medium mb-1">No pipeline yet</p>
          <p className="text-sm text-gray-400 mb-5">Create a pipeline to start tracking your deals through stages.</p>
          <button
            onClick={() => setShowCreatePipeline(true)}
            className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            Create Pipeline
          </button>
        </div>
        {showCreatePipeline && (
          <CreatePipelineModal
            onClose={() => setShowCreatePipeline(false)}
            onCreated={() => { void qc.invalidateQueries({ queryKey: ["pipelines"] }); }}
          />
        )}
      </div>
    );
  }

  return (
    <PermissionGate permission="deals_access">
      <div className="p-6 space-y-4 min-h-screen">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreatePipeline(true)}
              className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
            >
              + Pipeline
            </button>
            {pipeline && (
              <button
                onClick={() => setShowAddDeal(true)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
              >
                Add Deal
              </button>
            )}
          </div>
        </div>

        {pipelines.length > 1 && (
          <div className="flex gap-1 border-b border-gray-200">
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePipelineId(p.id)}
                className={[
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  pipeline?.id === p.id
                    ? "border-green-600 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {pipeline && (
          <KanbanBoard
            deals={deals}
            stages={stages}
            pipelineId={pipeline.id}
            onMutated={invalidate}
            onDealClick={(deal) => setSelectedDeal(deal)}
          />
        )}

        {showAddDeal && pipeline && (
          <AddDealModal
            pipelineId={pipeline.id}
            stages={stages}
            onClose={() => setShowAddDeal(false)}
            onCreated={() => { setShowAddDeal(false); invalidate(); }}
          />
        )}

        {showCreatePipeline && (
          <CreatePipelineModal
            onClose={() => setShowCreatePipeline(false)}
            onCreated={() => { void qc.invalidateQueries({ queryKey: ["pipelines"] }); }}
          />
        )}

        {selectedDeal && pipeline && (
          <DealSlideOver
            deal={selectedDeal}
            stages={stages}
            onClose={() => setSelectedDeal(null)}
            onUpdated={() => { setSelectedDeal(null); invalidate(); }}
            onDeleted={() => { setSelectedDeal(null); invalidate(); }}
          />
        )}
      </div>
    </PermissionGate>
  );
}
