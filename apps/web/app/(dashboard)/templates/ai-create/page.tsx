"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { AiCreatorLayout } from "@/components/ai/AiCreatorLayout";
import { AiChatPanel, type ChatMessage } from "@/components/ai/AiChatPanel";
import { AiActionBar } from "@/components/ai/AiActionBar";
import { TemplateAiPreview } from "@/components/ai/TemplateAiPreview";
import type { TemplateFormState } from "@/app/(dashboard)/templates/new/templateFormTypes";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function TemplateAiCreatePage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! Describe the template you want to create. For example: \"30% off Eid sale with a Shop Now button\" or \"Order confirmation with a track shipment link\"." },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [templateState, setTemplateState] = useState<TemplateFormState | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefineMode, setIsRefineMode] = useState(false);

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

      if (!isRefineMode || !templateState) {
        // Initial generation
        const res = await fetch(`${API_URL}/v1/ai/creator/template/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify({ description: text }),
        });
        if (!res.ok) {
          const json = await res.json() as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Generation failed");
        }
        const json = await res.json() as { data: { templateState: TemplateFormState; imageUrl: string } };
        setTemplateState(json.data.templateState);
        setImageUrl(json.data.imageUrl);
        setIsRefineMode(true);
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `Template generated! You can review the preview on the right. Want to change anything? Just describe it, or click one of the actions below.`,
        }]);
      } else {
        // Refinement
        setImageLoading(false);
        const res = await fetch(`${API_URL}/v1/ai/creator/template/refine`, {
          method: "POST",
          headers,
          body: JSON.stringify({ templateState, imageUrl, refinement: text }),
        });
        if (!res.ok) {
          const json = await res.json() as { error?: { message?: string } };
          throw new Error(json.error?.message ?? "Refinement failed");
        }
        const json = await res.json() as { data: { templateState: TemplateFormState; imageUrl: string; regenerateImage: boolean } };
        setTemplateState(json.data.templateState);
        if (json.data.regenerateImage) {
          setImageLoading(true);
          setImageUrl("");
          // Image comes back in the response if regenerated
          if (json.data.imageUrl) {
            setImageUrl(json.data.imageUrl);
            setImageLoading(false);
          }
        } else {
          setImageUrl(json.data.imageUrl);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: "Updated! Check the preview." }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setIsPending(false);
      setImageLoading(false);
    }
  }

  function handleEditManually() {
    if (!templateState) return;
    const draft = { ...templateState, headerMediaUrl: imageUrl || templateState.headerMediaUrl };
    sessionStorage.setItem("ai_template_draft", JSON.stringify(draft));
    router.push("/templates/new?from_ai=true");
  }

  function handleSubmit() {
    if (!templateState) return;
    const draft = { ...templateState, headerMediaUrl: imageUrl || templateState.headerMediaUrl };
    sessionStorage.setItem("ai_template_draft", JSON.stringify(draft));
    sessionStorage.setItem("ai_template_auto_submit", "true");
    router.push("/templates/new?from_ai=true");
  }

  return (
    <AiCreatorLayout
      title="Create Template with AI"
      backHref="/templates"
      preview={
        <div className="flex flex-col h-full">
          <TemplateAiPreview
            templateState={templateState}
            imageUrl={imageUrl}
            imageLoading={imageLoading}
          />
          {templateState && (
            <AiActionBar
              onPrimary={handleSubmit}
              primaryLabel="Submit for Approval"
              onRefine={() => {
                setMessages((prev) => [...prev, { role: "assistant", content: "What would you like to change?" }]);
              }}
              onEdit={handleEditManually}
              disabled={isPending}
            />
          )}
        </div>
      }
    >
      <AiChatPanel
        messages={messages}
        onSend={handleSend}
        isPending={isPending}
        placeholder="Describe the template you want to create..."
      />
      {error && (
        <p className="px-4 pb-2 text-xs text-red-600">{error}</p>
      )}
    </AiCreatorLayout>
  );
}
