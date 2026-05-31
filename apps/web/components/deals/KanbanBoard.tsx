"use client";

import { JSX, useState, useEffect } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "@clerk/nextjs";
import { DealCard, type Deal } from "./DealCard";
import { AddDealModal } from "./AddDealModal";

interface KanbanBoardProps {
  deals: Deal[];
  stages: string[];
  pipelineId: string;
  onMutated: () => void;
  onDealClick?: (deal: Deal) => void;
}

export function KanbanBoard({ deals: initialDeals, stages, pipelineId, onMutated, onDealClick }: KanbanBoardProps): JSX.Element {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [addStage, setAddStage] = useState<string | null>(null);
  const { getToken } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Sync local deals when parent React Query refetch delivers new data
  useEffect(() => { setDeals(initialDeals); }, [initialDeals]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over || active.id === over.id) return;

    const targetStage = over.id as string;
    if (!stages.includes(targetStage)) return;

    setDeals((prev) =>
      prev.map((d) => (d.id === active.id ? { ...d, stage: targetStage } : d))
    );

    const token = await getToken();
    const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
    await fetch(`${api}/v1/deals/${active.id as string}/stage`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    });
    onMutated();
  }

  function stageDeals(stage: string) {
    return deals.filter((d) => d.stage === stage);
  }

  function stageValue(stage: string): number {
    return stageDeals(stage).reduce((sum, d) => sum + (d.value != null ? Number(d.value) : 0), 0);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragEnd={(e: DragEndEvent) => { void handleDragEnd(e); }}
        onDragStart={({ active }: DragStartEvent) =>
          setActiveDeal(deals.find((d) => d.id === active.id) ?? null)
        }
      >
        <div className="flex gap-4 overflow-x-auto pb-6">
          {stages.map((stage) => {
            const stageDealList = stageDeals(stage);
            const total = stageValue(stage);
            const formattedTotal = total > 0
              ? total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
              : null;

            return (
              <div
                key={stage}
                id={stage}
                className="flex flex-col gap-3 min-w-60 w-60 flex-shrink-0"
              >
                <div className="flex items-start justify-between px-1">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage}</h3>
                    {formattedTotal && (
                      <p className="text-xs text-gray-400 mt-0.5">{formattedTotal}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5">
                    {stageDealList.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 min-h-20 bg-gray-50 rounded-xl p-2 border border-gray-200">
                  <SortableContext
                    items={stageDealList.map((d) => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {stageDealList.map((deal) => (
                      <DealCard key={deal.id} deal={deal} onClick={onDealClick} />
                    ))}
                  </SortableContext>
                  <button
                    onClick={() => setAddStage(stage)}
                    className="text-xs text-gray-400 hover:text-gray-600 py-1.5 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-white transition-colors"
                  >
                    + Add deal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
      </DndContext>

      {addStage && (
        <AddDealModal
          pipelineId={pipelineId}
          stages={stages}
          defaultStage={addStage}
          onClose={() => setAddStage(null)}
          onCreated={() => { setAddStage(null); onMutated(); }}
        />
      )}
    </>
  );
}
