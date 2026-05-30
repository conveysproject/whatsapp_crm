"use client";

import { JSX, useState, useCallback, useRef, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { TriggerNode } from "./nodes/TriggerNode";
import { ActionNode } from "./nodes/ActionNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { FlowNodePalette } from "./FlowNodePalette";
import { FlowConfigPanel } from "./FlowConfigPanel";
import { FlowLogsTab } from "./FlowLogsTab";
import { getLayoutedElements } from "./utils/layout";
import {
  deserializeFlow,
  serializeFlow,
  getDefaultConfig,
  getLabelFromConfig,
  type FlowData,
} from "./utils/serialize";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
};

interface FlowRun {
  id: string;
  contactPhone: string | null;
  conversationId: string | null;
  status: string;
  stepsExecuted: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function FlowEditor({ initialFlow }: { initialFlow: FlowData }): JSX.Element {
  const { getToken } = useAuth();

  const { nodes: initNodes, edges: initEdges } = deserializeFlow(initialFlow);
  const layoutedInit = getLayoutedElements(initNodes, initEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedInit);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [flowName, setFlowName] = useState(initialFlow.name);
  const [isActive, setIsActive] = useState(initialFlow.isActive);
  const [isToggling, setIsToggling] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"builder" | "logs">("builder");

  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const rfWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); void handleSave(); }
      if (e.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, nodes, edges, flowName]);

  useEffect(() => {
    if (activeTab !== "logs") return;
    setLoadingRuns(true);
    getToken()
      .then((token) =>
        fetch(`${API_URL}/v1/flows/${initialFlow.id}/runs`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        })
      )
      .then((r) => r.json())
      .then((body) => setRuns((body as { data: FlowRun[] }).data))
      .catch(() => undefined)
      .finally(() => setLoadingRuns(false));
  }, [activeTab, initialFlow.id, getToken]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => setSelectedNodeId(node.id), []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          { ...params, animated: isActive, style: { stroke: "#16a34a", strokeWidth: 2 }, type: "smoothstep" },
          eds
        );
        setIsDirty(true);
        return next;
      });
    },
    [isActive, setEdges]
  );

  const handleAddNode = useCallback(
    (type: string) => {
      const id = `node-${Date.now()}`;
      const newNode: Node = {
        id,
        type: type === "condition" ? "condition" : "action",
        position: { x: 200, y: 0 },
        data: {
          nodeType: type,
          config: getDefaultConfig(type),
          label: getLabelFromConfig(type, getDefaultConfig(type)),
        },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        return getLayoutedElements(updated, edges);
      });

      setEdges((eds) => {
        const lastNode = nodes[nodes.length - 1];
        if (!lastNode) return eds;
        const alreadyConnected = eds.some((e) => e.source === lastNode.id && !e.sourceHandle);
        if (alreadyConnected) return eds;
        return addEdge(
          {
            id: `e-${lastNode.id}-${id}`,
            source: lastNode.id,
            target: id,
            animated: isActive,
            style: { stroke: "#16a34a", strokeWidth: 2 },
            type: "smoothstep",
          },
          eds
        );
      });

      setIsDirty(true);
      setSelectedNodeId(id);
    },
    [nodes, edges, isActive, setNodes, setEdges]
  );

  const handleDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !rfWrapper.current || !rfInstance) return;
      const bounds = rfWrapper.current.getBoundingClientRect();
      const position = rfInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const id = `node-${Date.now()}`;
      const newNode: Node = {
        id,
        type: type === "condition" ? "condition" : "action",
        position,
        data: {
          nodeType: type,
          config: getDefaultConfig(type),
          label: getLabelFromConfig(type, getDefaultConfig(type)),
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
      setSelectedNodeId(id);
    },
    [rfInstance, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleConfigUpdate = useCallback(
    (nodeId: string, config: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, config, label: getLabelFromConfig(n.data.nodeType as string, config) } }
            : n
        )
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setNodes((nds) => {
        const filtered = nds.filter((n) => n.id !== nodeId);
        const filteredEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
        return getLayoutedElements(filtered, filteredEdges);
      });
      setSelectedNodeId(null);
      setIsDirty(true);
    },
    [setNodes, setEdges, edges]
  );

  async function handleSave(): Promise<void> {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const token = await getToken();
      const flowDefinition = serializeFlow(nodes, edges);
      const res = await fetch(`${API_URL}/v1/flows/${initialFlow.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: flowName, flowDefinition }),
      });
      if (res.ok) setIsDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(): Promise<void> {
    setIsToggling(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/flows/${initialFlow.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (res.ok) {
        const nextActive = !isActive;
        setIsActive(nextActive);
        setEdges((eds) => eds.map((e) => ({ ...e, animated: nextActive })));
      }
    } finally {
      setIsToggling(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0 h-14">
        <Link href="/flows" className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">
          ← Flows
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        <span
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const n = e.currentTarget.textContent?.trim() ?? "";
            if (n && n !== flowName) { setFlowName(n); setIsDirty(true); }
          }}
          className="text-sm font-semibold text-gray-900 outline-none border-b border-transparent hover:border-gray-300 focus:border-brand-500 px-1 min-w-[80px] max-w-[260px] truncate"
        >
          {initialFlow.name}
        </span>
        {isDirty && (
          <span className="flex items-center gap-1 text-xs text-amber-600 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Unsaved
          </span>
        )}

        <div className="flex gap-1 ml-2 bg-gray-100 rounded-lg p-0.5">
          {(["builder", "logs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => void handleSave()}
          disabled={!isDirty || saving}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          onClick={() => void handleToggle()}
          disabled={isToggling}
          className={[
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
            isActive
              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
          ].join(" ")}
        >
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`} />
          {isToggling ? "…" : isActive ? "Active" : "Inactive"}
        </button>
      </div>

      {/* Body */}
      {activeTab === "builder" ? (
        <div className="flex flex-1 overflow-hidden">
          <FlowNodePalette
            triggerType={initialFlow.triggerType}
            onAddNode={handleAddNode}
            onDragStart={handleDragStart}
          />

          <div
            ref={rfWrapper}
            className="flex-1 h-full"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedNodeId(null)}
              onInit={setRfInstance}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              deleteKeyCode={null}
              className="bg-white"
            >
              <Background color="#E5E7EB" gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <FlowConfigPanel
            node={selectedNode}
            onUpdate={handleConfigUpdate}
            onDelete={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        </div>
      ) : (
        <FlowLogsTab runs={runs} loading={loadingRuns} />
      )}
    </div>
  );
}
