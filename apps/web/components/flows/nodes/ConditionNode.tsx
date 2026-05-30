"use client";

import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface ConditionNodeData {
  label: string;
  config: Record<string, unknown>;
}

export function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>): JSX.Element {
  return (
    <div
      className={[
        "w-[280px] rounded-xl bg-white shadow-card transition-all",
        "border border-gray-200",
        selected ? "ring-2 ring-brand-500 ring-offset-2" : "",
      ].join(" ")}
      style={{ borderLeft: "4px solid #6366F1" }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white"
      />
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="text-base leading-none">🔀</span>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Condition</span>
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-gray-700 line-clamp-2">{data.label}</p>
      </div>
      {/* Yes / No output handles */}
      <div className="relative pb-3">
        <Handle
          type="source"
          position={Position.Bottom}
          id="yes"
          style={{ left: "28%" }}
          className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="no"
          style={{ left: "72%" }}
          className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
        />
        <div className="flex justify-between px-6 text-[10px] font-semibold">
          <span className="text-green-600 uppercase">Yes</span>
          <span className="text-red-600 uppercase">No</span>
        </div>
      </div>
    </div>
  );
}
