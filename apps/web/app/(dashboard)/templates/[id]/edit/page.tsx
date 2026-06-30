"use client";
import { useEffect, useState, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { TemplateForm } from "../../new/TemplateForm";
import { INITIAL_STATE } from "../../new/templateFormTypes";
import type { TemplateFormState, TemplateCategory, ButtonType } from "../../new/templateFormTypes";

interface StoredComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
}

function componentsToState(
  components: StoredComponent[],
  name: string,
  category: string,
  language: string
): TemplateFormState {
  const state: TemplateFormState = {
    ...INITIAL_STATE,
    name,
    category: category as TemplateCategory,
    language,
  };

  for (const comp of components) {
    const type = comp.type?.toUpperCase();
    if (type === "HEADER") {
      const fmt = comp.format?.toLowerCase() ?? "none";
      if (fmt === "text") {
        state.headerType = "text";
        state.headerText = comp.text ?? "";
      } else if (fmt === "image" || fmt === "video" || fmt === "document" || fmt === "location") {
        state.headerType = fmt;
      }
    } else if (type === "BODY") {
      state.bodyText = comp.text ?? "";
    } else if (type === "FOOTER") {
      state.footerText = comp.text ?? "";
    } else if (type === "BUTTONS") {
      state.buttons = (comp.buttons ?? []).map((btn, idx) => ({
        id: String(idx + 1),
        type: (btn.type?.toLowerCase() ?? "quick_reply") as ButtonType,
        text: btn.text ?? "",
        url: btn.url ?? "",
        urlIsDynamic: (btn.url ?? "").includes("{{"),
        urlExample: "",
        phone: btn.phone_number ?? "",
        couponExample: "",
      }));
    }
  }

  return state;
}

export default function EditTemplatePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [initialState, setInitialState] = useState<TemplateFormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const token = await getToken();
        const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        const res = await fetch(`${apiUrl}/v1/templates/${id}`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) {
          setError("Template not found");
          return;
        }
        const { data } = await res.json() as {
          data: {
            name: string;
            category: string;
            language: string;
            components: StoredComponent[];
          };
        };
        setInitialState(componentsToState(data.components, data.name, data.category, data.language));
      } catch {
        setError("Failed to load template");
      }
    }
    void load();
  }, [id, getToken]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-red-500">{error}</div>
    );
  }

  if (!initialState) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">Loading…</div>
    );
  }

  return <TemplateForm initialState={initialState} templateId={id} />;
}
