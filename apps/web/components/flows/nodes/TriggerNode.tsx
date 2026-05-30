"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface TriggerNodeData {
  triggerType: string;
  label: string;
  config?: Record<string, unknown>;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation:      "New Conversation Starts",
  inbound_message:       "Incoming Message",
  keyword_match:         "Keyword Matched",
  button_reply:          "Button Reply",
  contact_created:       "Contact Created",
  tag_added:             "Label Added",
  lifecycle_change:      "Stage Changed",
  conversation_resolved: "Conversation Resolved",
  conversation_assigned: "Conversation Assigned",
  no_reply:              "No Reply",
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact:         "Exactly",
  contains:      "Contains",
  starts_with:   "Starts with",
  ends_with:     "Ends with",
  contains_word: "Contains word",
};

function TriggerDetail({ triggerType, config }: { triggerType: string; config?: Record<string, unknown> }): JSX.Element | null {
  if (triggerType === "keyword_match" && config?.["keyword"]) {
    const matchLabel = MATCH_TYPE_LABELS[(config["matchType"] as string) ?? "contains"] ?? "Contains";
    return <p className="text-[9px] text-gray-400 mt-0.5 truncate">{matchLabel}: &ldquo;{String(config["keyword"])}&rdquo;</p>;
  }
  if (triggerType === "button_reply" && config?.["buttonText"]) {
    return <p className="text-[9px] text-gray-400 mt-0.5 truncate">Button: &ldquo;{String(config["buttonText"])}&rdquo;</p>;
  }
  if (triggerType === "no_reply" && config?.["hours"]) {
    return <p className="text-[9px] text-gray-400 mt-0.5">After {String(config["hours"])}h no reply</p>;
  }
  return null;
}

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
        <TriggerDetail triggerType={data.triggerType} config={data.config} />
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-brand-500 !border-2 !border-white"
      />
    </div>
  );
}
