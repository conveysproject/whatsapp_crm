"use client";

import { JSX, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
};

interface FlowCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
  readOnly?: boolean;
}

export function FlowCanvas({ initialNodes, initialEdges, onChange, readOnly = false }: FlowCanvasProps): JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds: Edge[]) => {
      const next = addEdge({ ...params, animated: true }, eds);
      onChange?.(nodes, next);
      return next;
    });
  }, [nodes, onChange, setEdges]);

  return (
    <div style={{ height: "calc(100vh - 200px)" }} className="rounded-xl border border-gray-200 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
      >
        <Background gap={16} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap nodeColor="#22c55e" />
      </ReactFlow>
    </div>
  );
}
