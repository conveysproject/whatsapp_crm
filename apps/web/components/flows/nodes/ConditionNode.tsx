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
        "w-[160px] rounded-md bg-white shadow-sm transition-all",
        "border border-gray-200",
        selected ? "ring-2 ring-brand-500 ring-offset-1" : "",
      ].join(" ")}
      style={{ borderLeft: "3px solid #6366F1" }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 !border-2 !border-white"
      />
      <div className="px-2.5 pt-1.5 pb-0.5 flex items-center gap-1">
        <span className="text-[10px] leading-none">🔀</span>
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Condition</span>
      </div>
      <div className="px-2.5 pb-1.5">
        <p className="text-[11px] text-gray-700 line-clamp-2 leading-tight">{data.label}</p>
      </div>
      <div className="relative pb-2">
        <Handle
          type="source"
          position={Position.Bottom}
          id="yes"
          style={{ left: "28%" }}
          className="!w-2 !h-2 !bg-green-500 !border-2 !border-white"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="no"
          style={{ left: "72%" }}
          className="!w-2 !h-2 !bg-red-500 !border-2 !border-white"
        />
        <div className="flex justify-between px-4 text-[9px] font-semibold">
          <span className="text-green-600 uppercase">Yes</span>
          <span className="text-red-600 uppercase">No</span>
        </div>
      </div>
    </div>
  );
}
