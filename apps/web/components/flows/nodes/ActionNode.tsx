import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface ActionNodeData {
  type: string;
  label: string;
  config: Record<string, unknown>;
}

const typeColors: Record<string, string> = {
  send_message:         "bg-blue-50 border-blue-400 text-blue-900",
  update_stage:         "bg-purple-50 border-purple-400 text-purple-900",
  assign_conversation:  "bg-yellow-50 border-yellow-400 text-yellow-900",
  add_tag:              "bg-green-50 border-green-400 text-green-900",
  wait:                 "bg-gray-50 border-gray-400 text-gray-900",
};

export function ActionNode({ data }: NodeProps<ActionNodeData>): JSX.Element {
  const colorClass = typeColors[data.type] ?? "bg-gray-50 border-gray-400 text-gray-900";
  return (
    <div className={`border-2 rounded-xl px-4 py-3 min-w-36 shadow-card ${colorClass}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-400" />
      <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{data.type.replace(/_/g, " ")}</p>
      <p className="text-sm mt-1">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-gray-400" />
    </div>
  );
}
