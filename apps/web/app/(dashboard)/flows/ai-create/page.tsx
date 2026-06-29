"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AiCreatorLayout } from "@/components/ai/AiCreatorLayout";
import { AiChatPanel, type ChatMessage } from "@/components/ai/AiChatPanel";
import { AiActionBar } from "@/components/ai/AiActionBar";
import { FlowAiPreview } from "@/components/ai/FlowAiPreview";
import type { FlowDefinition } from "@/components/flows/utils/serialize";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface AiFlowResult {
  flowDefinition: FlowDefinition;
  triggerType: string;
  suggestedName: string;
}

export default function FlowAiCreatePage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        'Hi! Describe the automation flow you want to build. For example: "When a customer says refund, send our policy template, if no reply in 2 hours assign to billing team".',
    },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [flowResult, setFlowResult] = useState<AiFlowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefineMode, setIsRefineMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [flowName, setFlowName] = useState("");

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  async function handleSend(text: string) {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsPending(true);
    setError(null);

    try {
      const headers = await authHeaders();

      if (!isRefineMode || !flowResult) {
        const res = await fetch(`${API_URL}/v1/ai/creator/flow/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ description: text }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Generation failed");
        }
        const json = (await res.json()) as { data: AiFlowResult };
        setFlowResult(json.data);
        setFlowName(json.data.suggestedName);
        setIsRefineMode(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Flow built! You can see the node graph on the right. Want to adjust anything? Just describe the change, or click Save Flow below.",
          },
        ]);
      } else {
        const res = await fetch(`${API_URL}/v1/ai/creator/flow/refine`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            flowDefinition: flowResult.flowDefinition,
            triggerType: flowResult.triggerType,
            refinement: text,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Refinement failed");
        }
        const json = (await res.json()) as {
          data: { flowDefinition: FlowDefinition; triggerType: string };
        };
        setFlowResult((prev) =>
          prev
            ? { ...prev, flowDefinition: json.data.flowDefinition, triggerType: json.data.triggerType }
            : prev,
        );
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Flow updated! Check the graph." },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setIsPending(false);
    }
  }

  async function handleSaveFlow() {
    if (!flowResult || !flowName.trim()) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/v1/flows`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: flowName.trim(),
          triggerType: flowResult.triggerType,
          flowDefinition: flowResult.flowDefinition,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? "Save failed");
      }
      const json = (await res.json()) as { data: { id: string } };
      router.push(`/flows/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      setShowNameModal(false);
    }
  }

  return (
    <>
      <AiCreatorLayout
        title="Create Flow with AI"
        backHref="/flows"
        preview={
          <div className="flex flex-col h-full">
            <FlowAiPreview
              flowDefinition={flowResult?.flowDefinition ?? null}
              triggerType={flowResult?.triggerType ?? "new_conversation"}
            />
            {flowResult && (
              <AiActionBar
                onPrimary={() => setShowNameModal(true)}
                primaryLabel="Save Flow"
                onRefine={() => {
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "What would you like to change in the flow?" },
                  ]);
                }}
                onEdit={() => setShowNameModal(true)}
                editLabel="Save & Open Editor"
                disabled={isPending || saving}
              />
            )}
          </div>
        }
      >
        <AiChatPanel
          messages={messages}
          onSend={handleSend}
          isPending={isPending}
          placeholder="Describe the automation flow you want to build..."
        />
        {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
      </AiCreatorLayout>

      {/* Name modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Name your flow</h2>
            <input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSaveFlow();
                }
              }}
              placeholder="e.g. Refund Handling"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void handleSaveFlow();
                }}
                disabled={!flowName.trim() || saving}
                className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save & Open Editor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
