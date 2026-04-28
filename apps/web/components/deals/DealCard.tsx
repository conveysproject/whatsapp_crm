import { JSX } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Deal {
  id: string;
  title: string;
  value: number | null;
  assignedTo: string | null;
}

interface DealCardProps {
  deal: Deal;
}

export function DealCard({ deal }: DealCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={[
        "bg-white rounded-lg border border-gray-200 p-3 shadow-card cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-50 shadow-lg" : "",
      ].join(" ")}
    >
      <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
      {deal.value != null && (
        <p className="text-xs text-gray-500 mt-1">₹{deal.value.toLocaleString("en-IN")}</p>
      )}
      {deal.assignedTo && (
        <p className="text-xs text-gray-400 mt-1">@{deal.assignedTo}</p>
      )}
    </div>
  );
}
