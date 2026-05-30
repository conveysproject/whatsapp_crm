"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface ActionNodeData {
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

const NODE_META: Record<string, { icon: string; label: string; color: string }> = {
  send_message:         { icon: "💬", label: "Send Text",       color: "#3B82F6" },
  send_text:            { icon: "💬", label: "Send Text",       color: "#3B82F6" },
  send_image:           { icon: "🖼️",  label: "Send Image",      color: "#06B6D4" },
  send_video:           { icon: "🎬", label: "Send Video",      color: "#06B6D4" },
  send_document:        { icon: "📎", label: "Send Document",   color: "#64748B" },
  send_media:           { icon: "🖼️",  label: "Send Media",      color: "#06B6D4" },
  send_buttons:         { icon: "🔘", label: "Send Buttons",    color: "#6366F1" },
  send_interactive:     { icon: "🔘", label: "Send Buttons",    color: "#6366F1" },
  send_list:            { icon: "📋", label: "Send List",       color: "#8B5CF6" },
  ask_question:         { icon: "❓", label: "Ask Question",    color: "#14B8A6" },
  wait:                 { icon: "⏱️",  label: "Wait / Delay",   color: "#F59E0B" },
  add_tag:              { icon: "🏷️",  label: "Add Label",       color: "#22C55E" },
  add_label:            { icon: "🏷️",  label: "Add Label",       color: "#22C55E" },
  update_stage:         { icon: "📈", label: "Update Stage",    color: "#A855F7" },
  assign_conversation:  { icon: "👤", label: "Assign Agent",    color: "#F97316" },
  assign_agent:         { icon: "👤", label: "Assign Agent",    color: "#F97316" },
  close_conversation:   { icon: "✅", label: "Close Chat",      color: "#EF4444" },
  end:                  { icon: "🔚", label: "End Flow",        color: "#6B7280" },
};

export function ActionNode({ data, selected }: NodeProps<ActionNodeData>): JSX.Element {
  const meta = NODE_META[data.nodeType] ?? { icon: "⚙️", label: data.nodeType.replace(/_/g, " "), color: "#6B7280" };

  return (
    <div
      className={[
        "w-[160px] rounded-md bg-white shadow-sm transition-all",
        "border border-gray-200",
        selected ? "ring-2 ring-brand-500 ring-offset-1" : "",
      ].join(" ")}
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 !border-2 !border-white"
      />
      <div className="px-2.5 pt-1.5 pb-0.5 flex items-center gap-1">
        <span className="text-[10px] leading-none">{meta.icon}</span>
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{meta.label}</span>
      </div>
      <div className="px-2.5 pb-1.5">
        <p className="text-[11px] text-gray-700 line-clamp-2 leading-tight">{data.label}</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-300 !border-2 !border-white"
      />
    </div>
  );
}
