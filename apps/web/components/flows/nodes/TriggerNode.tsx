"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface TriggerNodeData {
  triggerType: string;
  label: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation Starts",
  keyword_match:    "Keyword Matched",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

export function TriggerNode({ data, selected }: NodeProps<TriggerNodeData>): JSX.Element {
  return (
    <div
      className={[
        "w-[280px] rounded-xl overflow-hidden shadow-card transition-all",
        selected ? "ring-2 ring-brand-500 ring-offset-2" : "",
      ].join(" ")}
    >
      <div className="bg-brand-600 px-4 py-2 flex items-center gap-2">
        <span className="text-base leading-none">⚡</span>
        <span className="text-xs font-bold text-white uppercase tracking-widest">Trigger</span>
      </div>
      <div className="bg-white px-4 py-3 border border-brand-200 border-t-0 rounded-b-xl">
        <p className="text-sm font-medium text-gray-900">
          {TRIGGER_LABELS[data.triggerType] ?? data.triggerType.replace(/_/g, " ")}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-brand-500 !border-2 !border-white"
      />
    </div>
  );
}
