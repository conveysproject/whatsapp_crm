"use client";

import { useState, JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";
import { MessageTextArea, WaBubblePreview, MediaAttach, type AttachedMedia } from "./automation-message-card";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface DelayedSettings {
  delayedEnabled: boolean;
  delayedMinutes: number;
  delayedMessage: string | null;
  delayedMessageData: AttachedMedia | null;
  delayedSendWithOoo: boolean;
}

interface Props {
  initial: DelayedSettings;
}

export function DelayedCard({ initial }: Props): JSX.Element {
  const { getToken } = useAuth();
  const initHours = Math.floor(initial.delayedMinutes / 60);
  const initMins = initial.delayedMinutes % 60;

  const [enabled, setEnabled] = useState(initial.delayedEnabled);
  const [hours, setHours] = useState(initHours);
  const [mins, setMins] = useState(initMins);
  const [message, setMessage] = useState(initial.delayedMessage ?? "");
  const [media, setMedia] = useState<AttachedMedia | null>(initial.delayedMessageData);
  const [sendWithOoo, setSendWithOoo] = useState(initial.delayedSendWithOoo);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMinutes = hours * 60 + mins;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (totalMinutes < 1 || totalMinutes > 1440) {
        throw new Error("Delay must be between 1 minute and 24 hours");
      }
      const t = await getToken();
      const res = await fetch(`${API_URL}/v1/automation/settings/delayed`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          delayedEnabled: enabled,
          delayedMinutes: totalMinutes,
          delayedMessage: message || null,
          delayedMessageData: media ?? null,
          delayedSendWithOoo: sendWithOoo,
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PermissionGate permission="automation_access" sub="automation_delayed_response">
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delayed Response</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Send an automatic message if no agent replies within the specified time during business hours.
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                If no agent replies within
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={(e) => { setHours(Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0))); setSaved(false); }}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-16 text-center"
                />
                <span className="text-sm text-gray-600">hrs</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={mins}
                  onChange={(e) => { setMins(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0))); setSaved(false); }}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-16 text-center"
                />
                <span className="text-sm text-gray-600">mins</span>
              </div>
              {totalMinutes < 1 && (
                <p className="text-xs text-red-500 mt-1">Must be at least 1 minute.</p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <MessageTextArea
                  label="Message"
                  value={message}
                  onChange={(v) => { setMessage(v); setSaved(false); }}
                  placeholder="Thanks for your patience! Our team will get back to you shortly."
                />
                <MediaAttach
                  value={media}
                  onChange={(m) => { setMedia(m); setSaved(false); }}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                <WaBubblePreview text={message} />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="sendWithOoo"
                checked={sendWithOoo}
                onChange={(e) => { setSendWithOoo(e.target.checked); setSaved(false); }}
                className="rounded mt-0.5"
              />
              <div>
                <label htmlFor="sendWithOoo" className="text-sm text-gray-700 cursor-pointer">
                  Send along with Out of Office message
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  If enabled, the delayed response fires even outside business hours.
                </p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={saving || (enabled && totalMinutes < 1)}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </PermissionGate>
  );
}
