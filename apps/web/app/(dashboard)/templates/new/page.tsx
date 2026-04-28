"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TemplatePreview } from "@/components/templates/TemplatePreview";

export default function NewTemplatePage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    category: "marketing",
    language: "en",
    header: "",
    body: "",
    footer: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const components = [
        ...(form.header ? [{ type: "HEADER", format: "TEXT", text: form.header }] : []),
        { type: "BODY", text: form.body },
        ...(form.footer ? [{ type: "FOOTER", text: form.footer }] : []),
      ];
      const res = await fetch(`${apiUrl}/v1/templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          language: form.language,
          components,
        }),
      });
      if (!res.ok) {
        setError("Failed to create template");
        return;
      }
      router.push("/templates");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">New Template</h1>
        <Input
          label="Template Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. welcome_message"
        />
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="marketing">Marketing</option>
              <option value="utility">Utility</option>
              <option value="authentication">Authentication</option>
            </select>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Language</label>
            <select
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="mr">Marathi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
            </select>
          </div>
        </div>
        <Input
          label="Header (optional)"
          value={form.header}
          onChange={(e) => setForm((f) => ({ ...f, header: e.target.value }))}
          placeholder="Bold header text"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Body</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={4}
            placeholder="Message body. Use {{1}} for variables."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>
        <Input
          label="Footer (optional)"
          value={form.footer}
          onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))}
          placeholder="Footer text"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          onClick={() => { void handleSubmit(); }}
          disabled={!form.name || !form.body || saving}
        >
          {saving ? "Creating…" : "Create Template"}
        </Button>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Preview</p>
        <TemplatePreview
          header={form.header}
          body={form.body || "Your message will appear here."}
          footer={form.footer}
        />
      </div>
    </div>
  );
}
