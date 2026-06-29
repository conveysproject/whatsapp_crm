"use client";

import { JSX } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { TriggerNode } from "@/components/flows/nodes/TriggerNode";
import { ActionNode } from "@/components/flows/nodes/ActionNode";
import { ConditionNode } from "@/components/flows/nodes/ConditionNode";
import { deserializeFlow } from "@/components/flows/utils/serialize";
import { getLayoutedElements } from "@/components/flows/utils/layout";
import type { FlowDefinition } from "@/components/flows/utils/serialize";

const NODE_TYPES = { trigger: TriggerNode, action: ActionNode, condition: ConditionNode };

interface FlowAiPreviewProps {
  flowDefinition: FlowDefinition | null;
  triggerType: string;
}

export function FlowAiPreview({ flowDefinition, triggerType }: FlowAiPreviewProps): JSX.Element {
  if (!flowDefinition) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400 text-center px-8">
          Describe your automation flow in the chat and AI will build the node graph here.
        </p>
      </div>
    );
  }

  const { nodes: rawNodes, edges } = deserializeFlow({
    id: "preview",
    name: "AI Preview",
    triggerType,
    isActive: false,
    flowDefinition,
  });
  const nodes = getLayoutedElements(rawNodes, edges);

  return (
    <div className="flex-1 relative">
      <p className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-gray-400 uppercase tracking-wide z-10">
        Flow Preview
      </p>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
