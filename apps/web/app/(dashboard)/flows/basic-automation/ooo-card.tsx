"use client";

import { useState, useEffect, JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";
import { MessageTextArea, WaBubblePreview, MediaAttach, type AttachedMedia } from "./automation-message-card";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OooSettings {
  oooEnabled: boolean;
  oooMessage: string | null;
  oooMessageData: AttachedMedia | null;
}

interface Props {
  initial: OooSettings;
}

export function OooCard({ initial }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [enabled, setEnabled] = useState(initial.oooEnabled);
  const [message, setMessage] = useState(initial.oooMessage ?? "");
  const [media, setMedia] = useState<AttachedMedia | null>(initial.oooMessageData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = still loading/unknown; true/false = confirmed from API
  const [hasBusinessHours, setHasBusinessHours] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkBusinessHours(): Promise<void> {
      try {
        const t = await getToken();
        const res = await fetch(`${API_URL}/v1/automation/business-hours`, {
          headers: { Authorization: `Bearer ${t ?? ""}` },
        });
        if (res.ok) {
          const body = await res.json() as { data: unknown[] };
          setHasBusinessHours(body.data.length > 0);
        }
        // non-ok response: leave null (don't block the user)
      } catch {
        // network error: leave null (don't block the user)
      }
    }
    void checkBusinessHours();
  }, [getToken]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const t = await getToken();
      const res = await fetch(`${API_URL}/v1/automation/settings/ooo`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          oooEnabled: enabled,
          oooMessage: message || null,
          oooMessageData: media ?? null,
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
    <PermissionGate permission="automation_access" sub="automation_ooo">
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Out of Office Message</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Automatically reply when a customer messages outside business hours.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEnabled(!enabled); setSaved(false); }}
            disabled={hasBusinessHours !== true}
            title={hasBusinessHours !== true ? "Configure Business Hours first" : undefined}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              hasBusinessHours !== true ? "opacity-40 cursor-not-allowed bg-gray-200" :
              enabled ? "bg-green-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <MessageTextArea
                label="Message"
                value={message}
                onChange={(v) => { setMessage(v); setSaved(false); }}
                placeholder="Sorry, we're currently out of office. We'll get back to you during business hours."
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
