import { JSX } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DealContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
}

export interface Deal {
  id: string;
  pipelineId: string;
  title: string;
  value: number | null;
  assignedTo: string | null;
  stage: string;
  notes: string | null;
  contact: DealContact | null;
}

interface DealCardProps {
  deal: Deal;
  onClick?: (deal: Deal) => void;
}

export function DealCard({ deal, onClick }: DealCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const contactName = deal.contact
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ") || deal.contact.phoneNumber
    : null;

  const formattedValue =
    deal.value != null
      ? Number(deal.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(deal)}
      className={[
        "bg-white rounded-lg border border-gray-200 p-3 shadow-card cursor-grab active:cursor-grabbing select-none",
        isDragging ? "opacity-50 shadow-lg" : "hover:border-gray-300 hover:shadow-md transition-shadow",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
    >
      <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
      {contactName && (
        <p className="text-xs text-gray-500 mt-1 truncate">{contactName}</p>
      )}
      {formattedValue && (
        <p className="text-xs font-semibold text-emerald-600 mt-1.5">{formattedValue}</p>
      )}
    </div>
  );
}
