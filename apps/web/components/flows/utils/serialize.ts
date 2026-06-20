import type { Node, Edge } from "reactflow";

export interface FlowNodeDef {
  id: string;
  type: string;
  config: Record<string, unknown>;
  next: string | null;
  nextNo?: string | null;
}

export interface FlowDefinition {
  startNodeId: string;
  nodes: FlowNodeDef[];
}

export interface FlowData {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  flowDefinition: FlowDefinition;
}

export function getLabelFromConfig(nodeType: string, config: Record<string, unknown>): string {
  const str = (k: string) => (config[k] as string | undefined) ?? "";
  switch (nodeType) {
    case "send_message":
    case "send_text":        return str("text").slice(0, 50) || "Send Text";
    case "send_image":       return str("caption").slice(0, 50) || "Send Image";
    case "send_video":       return str("caption").slice(0, 50) || "Send Video";
    case "send_document":    return str("filename").slice(0, 50) || "Send Document";
    case "send_media":       return str("caption").slice(0, 50) || "Send Media";
    case "send_buttons":
    case "send_interactive": return str("body").slice(0, 50) || "Send Buttons";
    case "send_list":        return str("header").slice(0, 50) || "Send List";
    case "ask_question":     return str("question").slice(0, 50) || "Ask Question";
    case "wait":             return `Wait ${config["duration"] ?? 1} ${config["unit"] ?? "hours"}`;
    case "add_tag":
    case "add_label":        return str("tag") ? `Add label: ${str("tag")}` : "Add Label";
    case "update_stage":     return str("leadStatusId") ? "Set status" : "Update Status";
    case "assign_agent":
    case "assign_conversation": return str("assignTo") ? `Assign to: ${str("assignTo")}` : "Assign Agent";
    case "close_conversation":  return "Close Conversation";
    case "condition":        return `If ${str("conditionType") || "contains"}: "${str("value")}"`;
    case "end":              return "End Flow";
    default:                 return nodeType.replace(/_/g, " ");
  }
}

export function getDefaultConfig(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case "send_text":
    case "send_message":        return { text: "" };
    case "send_image":          return { url: "", caption: "" };
    case "send_video":          return { url: "", caption: "" };
    case "send_document":       return { url: "", filename: "" };
    case "send_media":          return { mediaId: "", contentType: "image", caption: "" };
    case "send_buttons":
    case "send_interactive":    return { body: "", buttons: [{ id: "btn_1", text: "Option 1" }] };
    case "send_list":           return { header: "", items: [{ title: "Item 1", description: "" }] };
    case "ask_question":        return { question: "", saveToVariable: "" };
    case "condition":           return { conditionType: "contains", value: "" };
    case "wait":                return { duration: 1, unit: "hours" };
    case "add_label":
    case "add_tag":             return { tag: "" };
    case "update_stage":        return { leadStatusId: "" };
    case "assign_agent":
    case "assign_conversation": return { assignTo: "" };
    case "close_conversation":  return {};
    case "end":                 return {};
    default:                    return {};
  }
}

export function deserializeFlow(flow: FlowData): { nodes: Node[]; edges: Edge[] } {
  const { nodes: flowNodes, startNodeId } = flow.flowDefinition;

  const nodes: Node[] = (flowNodes ?? []).map((fn, index) => {
    const isStart = fn.id === startNodeId;
    const reactFlowType = isStart ? "trigger" : fn.type === "condition" ? "condition" : "action";
    return {
      id: fn.id,
      type: reactFlowType,
      position: { x: 200, y: index * 150 },
      data: {
        nodeType: fn.type,
        triggerType: isStart ? flow.triggerType : undefined,
        config: fn.config ?? {},
        label: isStart
          ? flow.triggerType.replace(/_/g, " ")
          : getLabelFromConfig(fn.type, fn.config ?? {}),
      },
      deletable: !isStart,
    };
  });

  const edges: Edge[] = [];
  (flowNodes ?? []).forEach((fn) => {
    if (fn.next) {
      edges.push({
        id: `e-${fn.id}-yes`,
        source: fn.id,
        target: fn.next,
        sourceHandle: fn.type === "condition" ? "yes" : undefined,
        animated: flow.isActive,
        style: { stroke: "#16a34a", strokeWidth: 2 },
        type: "smoothstep",
      });
    }
    if (fn.type === "condition" && fn.nextNo) {
      edges.push({
        id: `e-${fn.id}-no`,
        source: fn.id,
        target: fn.nextNo,
        sourceHandle: "no",
        animated: flow.isActive,
        style: { stroke: "#ef4444", strokeWidth: 2 },
        type: "smoothstep",
        label: "No",
      });
    }
  });

  return { nodes, edges };
}

export function serializeFlow(nodes: Node[], edges: Edge[]): FlowDefinition {
  const startNode = nodes.find((n) => n.type === "trigger");
  const startNodeId = startNode?.id ?? nodes[0]?.id ?? "";

  const flowNodes: FlowNodeDef[] = nodes.map((n) => {
    const outEdges = edges.filter((e) => e.source === n.id);
    const yesEdge = outEdges.find((e) => e.sourceHandle === "yes" || !e.sourceHandle);
    const noEdge = outEdges.find((e) => e.sourceHandle === "no");
    const nodeType = (n.data.nodeType as string) ?? n.type ?? "end";

    return {
      id: n.id,
      type: nodeType,
      config: (n.data.config as Record<string, unknown>) ?? {},
      next: yesEdge?.target ?? null,
      ...(n.type === "condition" ? { nextNo: noEdge?.target ?? null } : {}),
    };
  });

  return { startNodeId, nodes: flowNodes };
}
