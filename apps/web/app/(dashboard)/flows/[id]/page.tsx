"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { FlowCanvas } from "@/components/flows/FlowCanvas";
import { Button } from "@/components/ui/Button";
import type { Node, Edge } from "reactflow";

interface FlowNodeDef {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next: string | null;
}

interface Flow {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  flowDefinition: { startNodeId: string; nodes: FlowNodeDef[] };
}

function flowToReactFlow(flow: Flow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = flow.flowDefinition.nodes.map((n, i) => ({
    id: n.id,
    type: i === 0 ? "trigger" : "action",
    position: { x: 200, y: i * 150 },
    data: { label: (n.config["text"] as string) ?? n.type, type: n.type, triggerType: flow.triggerType, config: n.config },
  }));
  const edges: Edge[] = flow.flowDefinition.nodes
    .filter((n) => n.next)
    .map((n) => ({ id: `e-${n.id}`, source: n.id, target: n.next!, animated: true }));
  return { nodes, edges };
}

export default function FlowDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows/${id}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setFlow((await res.json() as { data: Flow }).data);
    }
    void load();
  }, [id, getToken]);

  async function toggleActive() {
    if (!flow) return;
    setToggling(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/flows/${flow.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !flow.isActive }),
      });
      if (res.ok) setFlow((await res.json() as { data: Flow }).data);
    } finally {
      setToggling(false);
    }
  }

  if (!flow) return <div className="animate-pulse h-96 bg-gray-100 rounded-xl" />;

  const { nodes, edges } = flowToReactFlow(flow);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{flow.name}</h1>
          <p className="text-sm text-gray-500">Trigger: {flow.triggerType.replace(/_/g, " ")}</p>
        </div>
        <Button variant={flow.isActive ? "destructive" : "primary"} onClick={() => void toggleActive()} disabled={toggling}>
          {toggling ? "…" : flow.isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>
      <FlowCanvas initialNodes={nodes} initialEdges={edges} readOnly />
    </div>
  );
}
