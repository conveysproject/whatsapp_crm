"use client";
import { JSX, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";

type AIBackend = "anthropic" | "flowise" | "openai";

interface VendorSettingsResponse {
  data: Record<string, string>;
}

interface VendorSetting {
  key: string;
  value: string;
  dataType: string;
}

export default function AISettingsPage(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const [backend, setBackend] = useState<AIBackend>("anthropic");
  const [flowiseUrl, setFlowiseUrl] = useState("");
  const [flowiseToken, setFlowiseToken] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");

  const { data: settings } = useQuery<VendorSettingsResponse>({
    queryKey: ["vendor-settings"],
    queryFn: async () => {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const res = await fetch(`${api}/v1/vendor-settings`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.json() as Promise<VendorSettingsResponse>;
    },
  });

  useEffect(() => {
    if (!settings?.data) return;
    const d = settings.data;
    if (d["open_ai_access_key"]) {
      setBackend("openai");
      setOpenAiKey(d["open_ai_access_key"]);
    } else if (d["flowise_url"]) {
      setBackend("flowise");
      setFlowiseUrl(d["flowise_url"]);
      if (d["flowise_access_token"]) {
        setFlowiseToken(d["flowise_access_token"]);
      }
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const settingsList: VendorSetting[] = [
        { key: "enable_flowise_ai_bot", value: String(backend === "flowise"), dataType: "boolean" },
        { key: "flowise_url", value: backend === "flowise" ? flowiseUrl : "", dataType: "string" },
        { key: "flowise_access_token", value: backend === "flowise" ? flowiseToken : "", dataType: "string" },
        { key: "enable_open_ai_bot", value: String(backend === "openai"), dataType: "boolean" },
        { key: "open_ai_access_key", value: backend === "openai" ? openAiKey : "", dataType: "string" },
      ];
      const res = await fetch(`${api}/v1/vendor-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({ settings: settingsList }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Backend</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose the AI engine that powers chatbot responses in your inbox.
        </p>
      </div>

      <div className="space-y-3">
        {/* Anthropic Claude */}
        <button
          type="button"
          onClick={() => setBackend("anthropic")}
          className={`w-full text-left border rounded-lg p-4 transition-colors ${
            backend === "anthropic"
              ? "border-violet-500 bg-violet-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                backend === "anthropic"
                  ? "border-violet-600 bg-violet-600"
                  : "border-gray-300"
              }`}
            />
            <div>
              <p className="font-medium text-sm">Anthropic Claude (Default)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Uses TrustCRM&apos;s built-in Claude Haiku for intelligent, context-aware responses. No extra configuration needed.
              </p>
            </div>
          </div>
        </button>

        {/* Flowise */}
        <div
          className={`border rounded-lg p-4 transition-colors ${
            backend === "flowise"
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200"
          }`}
        >
          <button
            type="button"
            onClick={() => setBackend("flowise")}
            className="w-full text-left"
          >
            <div className="flex items-center gap-3">
              <span
                className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                  backend === "flowise"
                    ? "border-blue-600 bg-blue-600"
                    : "border-gray-300"
                }`}
              />
              <div>
                <p className="font-medium text-sm">Flowise (Custom AI)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Connect your own Flowise instance to use a custom AI flow as the chatbot backend.
                </p>
              </div>
            </div>
          </button>

          {backend === "flowise" && (
            <div className="mt-4 ml-7 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Flowise URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={flowiseUrl}
                  onChange={(e) => setFlowiseUrl(e.target.value)}
                  placeholder="https://your-flowise-instance.com/api/v1/prediction/..."
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Access Token <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="password"
                  value={flowiseToken}
                  onChange={(e) => setFlowiseToken(e.target.value)}
                  placeholder="Bearer token for your Flowise API"
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* OpenAI */}
        <div
          className={`border rounded-lg p-4 transition-colors ${
            backend === "openai"
              ? "border-green-500 bg-green-50"
              : "border-gray-200"
          }`}
        >
          <button
            type="button"
            onClick={() => setBackend("openai")}
            className="w-full text-left"
          >
            <div className="flex items-center gap-3">
              <span
                className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                  backend === "openai"
                    ? "border-green-600 bg-green-600"
                    : "border-gray-300"
                }`}
              />
              <div>
                <p className="font-medium text-sm">OpenAI</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Use your own OpenAI API key to power chatbot responses with GPT models.
                </p>
              </div>
            </div>
          </button>

          {backend === "openai" && (
            <div className="mt-4 ml-7">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                OpenAI API Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
