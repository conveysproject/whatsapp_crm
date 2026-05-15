"use client";

import { JSX, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface InteractivePayload {
  type: "button" | "list";
  header?: { type: "text"; text: string };
  body: { text: string };
  footer?: { text: string };
  action: Record<string, unknown>;
}

interface Props {
  onSend: (payload: InteractivePayload) => void;
  onClose: () => void;
}

interface ButtonRow {
  id: string;
  title: string;
}

export function InteractiveMessagePicker({ onSend, onClose }: Props): JSX.Element {
  const [bodyText, setBodyText] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<ButtonRow[]>([
    { id: "btn-1", title: "" },
    { id: "btn-2", title: "" },
  ]);

  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((prev) => [...prev, { id: `btn-${Date.now()}`, title: "" }]);
  }

  function removeButton(id: string) {
    if (buttons.length <= 1) return;
    setButtons((prev) => prev.filter((b) => b.id !== id));
  }

  function updateButton(id: string, title: string) {
    setButtons((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
  }

  function handleSend() {
    const validButtons = buttons.filter((b) => b.title.trim());
    if (!bodyText.trim() || validButtons.length === 0) return;

    const payload: InteractivePayload = {
      type: "button",
      body: { text: bodyText.trim() },
      action: {
        buttons: validButtons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.trim() },
        })),
      },
    };
    if (headerText.trim()) payload.header = { type: "text", text: headerText.trim() };
    if (footerText.trim()) payload.footer = { text: footerText.trim() };

    onSend(payload);
  }

  const canSend = bodyText.trim().length > 0 && buttons.some((b) => b.title.trim().length > 0);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg p-4 z-20">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-800">Quick Reply Buttons</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-2">
        <Input
          placeholder="Header text (optional)"
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          className="text-sm"
        />
        <textarea
          placeholder="Body message *"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Input
          placeholder="Footer text (optional)"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          className="text-sm"
        />

        <div className="border-t border-gray-100 pt-2">
          <p className="text-xs text-gray-500 mb-2">Buttons (up to 3)</p>
          {buttons.map((btn) => (
            <div key={btn.id} className="flex items-center gap-1 mb-1">
              <Input
                placeholder="Button label"
                value={btn.title}
                onChange={(e) => updateButton(btn.id, e.target.value)}
                className="text-sm flex-1"
                maxLength={20}
              />
              <button
                onClick={() => removeButton(btn.id)}
                disabled={buttons.length <= 1}
                className="text-gray-400 hover:text-red-500 disabled:opacity-30 px-1"
              >
                ×
              </button>
            </div>
          ))}
          {buttons.length < 3 && (
            <button
              onClick={addButton}
              className="text-xs text-brand-600 hover:text-brand-700 mt-1"
            >
              + Add button
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-1">
          <Button variant="secondary" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={handleSend} disabled={!canSend} className="flex-1">Send</Button>
        </div>
      </div>
    </div>
  );
}
