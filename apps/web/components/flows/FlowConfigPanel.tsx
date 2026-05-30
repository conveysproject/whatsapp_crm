"use client";

import { JSX, useEffect, useState } from "react";
import type { Node } from "reactflow";

interface FlowConfigPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

const NODE_META: Record<string, { icon: string; label: string }> = {
  trigger:              { icon: "⚡", label: "Trigger" },
  send_message:         { icon: "💬", label: "Send Text" },
  send_text:            { icon: "💬", label: "Send Text" },
  send_image:           { icon: "🖼️",  label: "Send Image" },
  send_video:           { icon: "🎬", label: "Send Video" },
  send_document:        { icon: "📎", label: "Send Document" },
  send_media:           { icon: "🖼️",  label: "Send Media" },
  send_buttons:         { icon: "🔘", label: "Send Buttons" },
  send_interactive:     { icon: "🔘", label: "Send Buttons" },
  send_list:            { icon: "📋", label: "Send List" },
  ask_question:         { icon: "❓", label: "Ask Question" },
  condition:            { icon: "🔀", label: "Condition" },
  wait:                 { icon: "⏱️",  label: "Wait / Delay" },
  add_label:            { icon: "🏷️",  label: "Add Label" },
  add_tag:              { icon: "🏷️",  label: "Add Label" },
  update_stage:         { icon: "📈", label: "Update Stage" },
  assign_agent:         { icon: "👤", label: "Assign Agent" },
  assign_conversation:  { icon: "👤", label: "Assign Agent" },
  close_conversation:   { icon: "✅", label: "Close Chat" },
  end:                  { icon: "🔚", label: "End Flow" },
};

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation Starts",
  keyword_match:    "Keyword Matched",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

const VARS = ["{{first_name}}", "{{last_name}}", "{{phone}}"];

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</p>;
}

function Field({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="space-y-1">{children}</div>;
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  );
}

function Textarea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }): JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function FlowConfigPanel({ node, onUpdate, onDelete, onClose }: FlowConfigPanelProps): JSX.Element | null {
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (node) setConfig((node.data.config as Record<string, unknown>) ?? {});
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;

  const nodeType: string = (node.data.nodeType as string) ?? node.type ?? "";
  const meta = NODE_META[nodeType] ?? { icon: "⚙️", label: nodeType };
  const isTrigger = node.type === "trigger";
  const str = (k: string) => (config[k] as string | undefined) ?? "";
  const num = (k: string, def = 1) => (config[k] as number | undefined) ?? def;

  function set(key: string, value: unknown): void {
    const next = { ...config, [key]: value };
    setConfig(next);
    onUpdate(node!.id, next);
  }

  function setBtn(index: number, field: string, value: string): void {
    const buttons = [...((config["buttons"] as { id: string; text: string }[]) ?? [])];
    buttons[index] = { ...buttons[index]!, [field]: value };
    set("buttons", buttons);
  }

  function addBtn(): void {
    const buttons = [...((config["buttons"] as { id: string; text: string }[]) ?? [])];
    if (buttons.length >= 3) return;
    buttons.push({ id: `btn_${buttons.length + 1}`, text: "" });
    set("buttons", buttons);
  }

  function removeBtn(index: number): void {
    const buttons = ((config["buttons"] as { id: string; text: string }[]) ?? []).filter((_, i) => i !== index);
    set("buttons", buttons);
  }

  function setItem(index: number, field: string, value: string): void {
    const items = [...((config["items"] as { title: string; description: string }[]) ?? [])];
    items[index] = { ...items[index]!, [field]: value };
    set("items", items);
  }

  function addItem(): void {
    const items = [...((config["items"] as { title: string; description: string }[]) ?? [])];
    if (items.length >= 10) return;
    items.push({ title: "", description: "" });
    set("items", items);
  }

  function removeItem(index: number): void {
    const items = ((config["items"] as { title: string; description: string }[]) ?? []).filter((_, i) => i !== index);
    set("items", items);
  }

  return (
    <aside className="w-80 h-full bg-white border-l border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{meta.icon}</span>
          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ✕
        </button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {isTrigger && (
          <Field>
            <Label>Trigger Type</Label>
            <p className="text-sm text-gray-900">
              {TRIGGER_LABELS[(node.data.triggerType as string) ?? ""] ?? (node.data.triggerType as string)}
            </p>
            <p className="text-xs text-gray-400">Trigger type is set when the flow is created.</p>
          </Field>
        )}

        {(nodeType === "send_text" || nodeType === "send_message") && (
          <>
            <Field>
              <Label>Message</Label>
              <Textarea value={str("text")} onChange={(v) => set("text", v)} rows={4} />
            </Field>
            <div className="flex flex-wrap gap-1">
              {VARS.map((v) => (
                <button
                  key={v}
                  onClick={() => set("text", str("text") + v)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-600 font-mono"
                >
                  {v}
                </button>
              ))}
            </div>
          </>
        )}

        {(nodeType === "send_image" || nodeType === "send_video" || nodeType === "send_document" || nodeType === "send_media") && (
          <>
            <Field>
              <Label>{nodeType === "send_document" ? "Document URL or Media ID" : "Image/Video URL or Media ID"}</Label>
              <TextInput value={str("url") || str("mediaId")} onChange={(v) => set("url", v)} placeholder="https://... or media ID" />
            </Field>
            {nodeType === "send_document" ? (
              <Field>
                <Label>Filename</Label>
                <TextInput value={str("filename")} onChange={(v) => set("filename", v)} placeholder="document.pdf" />
              </Field>
            ) : (
              <Field>
                <Label>Caption (optional)</Label>
                <TextInput value={str("caption")} onChange={(v) => set("caption", v)} placeholder="Optional caption" />
              </Field>
            )}
          </>
        )}

        {(nodeType === "send_buttons" || nodeType === "send_interactive") && (
          <>
            <Field>
              <Label>Body Text</Label>
              <Textarea value={str("body")} onChange={(v) => set("body", v)} />
            </Field>
            <Field>
              <Label>Buttons (max 3)</Label>
              {((config["buttons"] as { id: string; text: string }[]) ?? []).map((btn, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <TextInput value={btn.text} onChange={(v) => setBtn(i, "text", v)} placeholder={`Button ${i + 1}`} />
                  <button onClick={() => removeBtn(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                </div>
              ))}
              {((config["buttons"] as unknown[]) ?? []).length < 3 && (
                <button onClick={addBtn} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add Button</button>
              )}
            </Field>
          </>
        )}

        {nodeType === "send_list" && (
          <>
            <Field>
              <Label>Header</Label>
              <TextInput value={str("header")} onChange={(v) => set("header", v)} placeholder="Choose an option" />
            </Field>
            <Field>
              <Label>List Items (max 10)</Label>
              {((config["items"] as { title: string; description: string }[]) ?? []).map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1">
                  <div className="flex gap-2 items-center">
                    <TextInput value={item.title} onChange={(v) => setItem(i, "title", v)} placeholder={`Item ${i + 1} title`} />
                    <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                  </div>
                  <TextInput value={item.description} onChange={(v) => setItem(i, "description", v)} placeholder="Description (optional)" />
                </div>
              ))}
              {((config["items"] as unknown[]) ?? []).length < 10 && (
                <button onClick={addItem} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Add Item</button>
              )}
            </Field>
          </>
        )}

        {nodeType === "ask_question" && (
          <>
            <Field>
              <Label>Question</Label>
              <Textarea value={str("question")} onChange={(v) => set("question", v)} />
            </Field>
            <Field>
              <Label>Save reply to variable</Label>
              <TextInput value={str("saveToVariable")} onChange={(v) => set("saveToVariable", v)} placeholder="e.g. user_reply" />
            </Field>
          </>
        )}

        {nodeType === "condition" && (
          <>
            <Field>
              <Label>Condition Type</Label>
              <Select
                value={str("conditionType") || "contains"}
                onChange={(v) => set("conditionType", v)}
                options={[
                  { value: "contains",    label: "Message contains" },
                  { value: "is",          label: "Message is exactly" },
                  { value: "starts_with", label: "Message starts with" },
                  { value: "ends_with",   label: "Message ends with" },
                ]}
              />
            </Field>
            <Field>
              <Label>Value</Label>
              <TextInput value={str("value")} onChange={(v) => set("value", v)} placeholder="e.g. yes" />
            </Field>
            <p className="text-xs text-gray-400">Connect the Yes handle to the next step if matched; No handle for the else branch.</p>
          </>
        )}

        {nodeType === "wait" && (
          <Field>
            <Label>Wait Duration</Label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={num("duration")}
                onChange={(e) => set("duration", parseInt(e.target.value, 10) || 1)}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <Select
                value={str("unit") || "hours"}
                onChange={(v) => set("unit", v)}
                options={[
                  { value: "minutes", label: "Minutes" },
                  { value: "hours",   label: "Hours" },
                  { value: "days",    label: "Days" },
                ]}
              />
            </div>
          </Field>
        )}

        {(nodeType === "add_label" || nodeType === "add_tag") && (
          <Field>
            <Label>Label Name</Label>
            <TextInput value={str("tag")} onChange={(v) => set("tag", v)} placeholder="e.g. interested" />
          </Field>
        )}

        {nodeType === "update_stage" && (
          <Field>
            <Label>Lifecycle Stage</Label>
            <Select
              value={str("lifecycleStage") || "lead"}
              onChange={(v) => set("lifecycleStage", v)}
              options={[
                { value: "lead",      label: "Lead" },
                { value: "prospect",  label: "Prospect" },
                { value: "customer",  label: "Customer" },
                { value: "loyal",     label: "Loyal" },
                { value: "churned",   label: "Churned" },
              ]}
            />
          </Field>
        )}

        {(nodeType === "assign_agent" || nodeType === "assign_conversation") && (
          <Field>
            <Label>Assign to (User ID)</Label>
            <TextInput value={str("assignTo")} onChange={(v) => set("assignTo", v)} placeholder="User ID" />
          </Field>
        )}

        {nodeType === "close_conversation" && (
          <p className="text-sm text-gray-500">This step closes the active conversation. No configuration needed.</p>
        )}

        {nodeType === "end" && (
          <p className="text-sm text-gray-500">Flow execution ends here. No further steps will run.</p>
        )}
      </div>

      {/* Footer — delete */}
      {!isTrigger && (
        <div className="px-4 py-3 border-t border-gray-200">
          <button
            onClick={() => onDelete(node.id)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <span>🗑</span>
            <span>Delete this step</span>
          </button>
        </div>
      )}
    </aside>
  );
}
