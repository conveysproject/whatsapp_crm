"use client";

import { JSX, useState } from "react";
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
import { DealCard } from "./DealCard";

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  assignedTo: string | null;
}

interface KanbanBoardProps {
  initialDeals: Deal[];
  stages: string[];
}

export function KanbanBoard({ initialDeals, stages }: KanbanBoardProps): JSX.Element {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const { getToken } = useAuth();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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
  }

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={(e: DragEndEvent) => { void handleDragEnd(e); }}
      onDragStart={({ active }: DragStartEvent) => setActiveDeal(deals.find((d) => d.id === active.id) ?? null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          return (
            <div key={stage} id={stage} className="flex flex-col gap-3 min-w-56 w-56">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage}</h3>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                  {stageDeals.length}
                </span>
              </div>
              <div className="flex flex-col gap-2 min-h-20 bg-gray-50 rounded-xl p-2 border border-gray-200">
                <SortableContext
                  items={stageDeals.map((d) => d.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {stageDeals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))}
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>
      <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
    </DndContext>
  );
}
