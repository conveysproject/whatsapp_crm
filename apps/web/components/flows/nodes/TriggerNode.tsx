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
        "w-[160px] rounded-md overflow-hidden shadow-sm transition-all",
        selected ? "ring-2 ring-brand-500 ring-offset-1" : "",
      ].join(" ")}
    >
      <div className="bg-brand-600 px-2.5 py-1 flex items-center gap-1">
        <span className="text-[10px] leading-none">⚡</span>
        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Trigger</span>
      </div>
      <div className="bg-white px-2.5 py-1.5 border border-brand-200 border-t-0 rounded-b-md">
        <p className="text-[11px] font-medium text-gray-900 leading-tight">
          {TRIGGER_LABELS[data.triggerType] ?? data.triggerType.replace(/_/g, " ")}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-brand-500 !border-2 !border-white"
      />
    </div>
  );
}
