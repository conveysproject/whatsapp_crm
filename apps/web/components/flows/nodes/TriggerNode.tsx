import { JSX } from "react";
import { Handle, Position, type NodeProps } from "reactflow";

interface TriggerNodeData {
  triggerType: string;
  label: string;
}

export function TriggerNode({ data }: NodeProps<TriggerNodeData>): JSX.Element {
  return (
    <div className="bg-brand-50 border-2 border-brand-400 rounded-xl px-4 py-3 min-w-36 shadow-card">
      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Trigger</p>
      <p className="text-sm text-brand-900 mt-1">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-brand-500" />
    </div>
  );
}
