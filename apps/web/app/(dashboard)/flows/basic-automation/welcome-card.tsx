"use client";

import { useState, JSX } from "react";
import { Button } from "@/components/ui/Button";
import { MessageTextArea, WaBubblePreview } from "./automation-message-card";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface WelcomeSettings {
  welcomeEnabled: boolean;
  welcomePersonalized: boolean;
  welcomeMessage: string | null;
  welcomeNewMessage: string | null;
  welcomeReturningMessage: string | null;
  welcomeFlowId: string | null;
}

interface Flow {
  id: string;
  name: string;
}

interface Props {
  initial: WelcomeSettings;
  flows: Flow[];
  token: string;
}

export function WelcomeCard({ initial, flows, token }: Props): JSX.Element {
  const [enabled, setEnabled] = useState(initial.welcomeEnabled);
  const [personalized, setPersonalized] = useState(initial.welcomePersonalized);
  const [message, setMessage] = useState(initial.welcomeMessage ?? "");
  const [newMessage, setNewMessage] = useState(initial.welcomeNewMessage ?? "");
  const [returningMessage, setReturningMessage] = useState(initial.welcomeReturningMessage ?? "");
  const [flowId, setFlowId] = useState(initial.welcomeFlowId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        welcomeEnabled: enabled,
        welcomePersonalized: personalized,
        welcomeFlowId: flowId || null,
      };
      if (personalized) {
        body["welcomeNewMessage"] = newMessage || null;
        body["welcomeReturningMessage"] = returningMessage || null;
      } else {
        body["welcomeMessage"] = message || null;
      }
      const res = await fetch(`${API_URL}/v1/automation/settings/welcome`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resBody = await res.json() as { error?: { message?: string } };
        throw new Error(resBody.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const previewText = personalized ? newMessage : message;

  return (
    <PermissionGate permission="automation_access" sub="automation_welcome_message">
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Welcome Message</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Send an automatic welcome when a customer messages for the first time or after 24h of inactivity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEnabled(!enabled); setSaved(false); }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {enabled && (
          <div className="space-y-5">
            {/* Personalisation toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="personalized"
                checked={personalized}
                onChange={(e) => { setPersonalized(e.target.checked); setSaved(false); }}
                className="rounded"
              />
              <label htmlFor="personalized" className="text-sm text-gray-700">
                Add personalisation (different messages for new vs returning customers)
              </label>
            </div>

            {personalized ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <MessageTextArea
                    label="New customers"
                    value={newMessage}
                    onChange={(v) => { setNewMessage(v); setSaved(false); }}
                    placeholder="Hi {{first_name}}, welcome! How can we help you today?"
                  />
                  <MessageTextArea
                    label="Existing / returning customers"
                    value={returningMessage}
                    onChange={(v) => { setReturningMessage(v); setSaved(false); }}
                    placeholder="Welcome back, {{first_name}}! How can we help you?"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview (new customer)</p>
                  <WaBubblePreview text={newMessage} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MessageTextArea
                  label="Message"
                  value={message}
                  onChange={(v) => { setMessage(v); setSaved(false); }}
                  placeholder="Hi {{first_name}}, thanks for reaching out! How can we help?"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                  <WaBubblePreview text={previewText} />
                </div>
              </div>
            )}

            {/* CTA: Bot Flow */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CTA after welcome message
              </label>
              <select
                value={flowId}
                onChange={(e) => { setFlowId(e.target.value); setSaved(false); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs"
              >
                <option value="">None (plain text only)</option>
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </PermissionGate>
  );
}
