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
        "w-[200px] rounded-lg bg-white shadow-sm transition-all",
        "border border-gray-200",
        selected ? "ring-2 ring-brand-500 ring-offset-1" : "",
      ].join(" ")}
      style={{ borderLeft: "3px solid #6366F1" }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-gray-300 !border-2 !border-white"
      />
      <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5">
        <span className="text-[11px] leading-none">🔀</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Condition</span>
      </div>
      <div className="px-3 pb-2">
        <p className="text-xs text-gray-700 line-clamp-2 leading-tight">{data.label}</p>
      </div>
      <div className="relative pb-2.5">
        <Handle
          type="source"
          position={Position.Bottom}
          id="yes"
          style={{ left: "28%" }}
          className="!w-2.5 !h-2.5 !bg-green-500 !border-2 !border-white"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="no"
          style={{ left: "72%" }}
          className="!w-2.5 !h-2.5 !bg-red-500 !border-2 !border-white"
        />
        <div className="flex justify-between px-5 text-[9px] font-semibold">
          <span className="text-green-600 uppercase">Yes</span>
          <span className="text-red-600 uppercase">No</span>
        </div>
      </div>
    </div>
  );
}
