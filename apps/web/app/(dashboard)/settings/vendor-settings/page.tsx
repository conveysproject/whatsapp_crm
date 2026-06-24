"use client";
import { JSX, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PermissionGate } from "@/components/PermissionGate";

interface VendorSettingsResponse {
  data: Record<string, string>;
}

export default function VendorSettingsPage(): JSX.Element {
  const qc = useQueryClient();

  const { data: settings } = useQuery<VendorSettingsResponse>({
    queryKey: ["vendor-settings"],
    queryFn: () => fetch("/api/v1/vendor-settings").then((r) => r.json() as Promise<VendorSettingsResponse>),
  });

  const [botTimingEnabled, setBotTimingEnabled] = useState(false);
  const [botStart, setBotStart] = useState("09:00");
  const [botEnd, setBotEnd] = useState("18:00");
  const [botTimezone, setBotTimezone] = useState("Asia/Kolkata");
  const [autoDelete, setAutoDelete] = useState(false);
  const [deleteDays, setDeleteDays] = useState("90");
  const [apiAccessToken, setApiAccessToken] = useState("");

  useEffect(() => {
    if (!settings?.data) return;
    setBotTimingEnabled(settings.data.enable_bot_timing_restrictions === "true");
    setBotStart(settings.data.bot_start_timing ?? "09:00");
    setBotEnd(settings.data.bot_end_timing ?? "18:00");
    setBotTimezone(settings.data.bot_timing_timezone ?? "Asia/Kolkata");
    setAutoDelete(settings.data.enable_automatic_message_deletion === "true");
    setDeleteDays(settings.data.delete_whatsapp_message_days ?? "90");
    setApiAccessToken(settings.data.vendor_api_access_token ?? "");
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      fetch("/api/v1/vendor-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [
            { key: "enable_bot_timing_restrictions", value: String(botTimingEnabled), dataType: "boolean" },
            { key: "bot_start_timing", value: botStart, dataType: "string" },
            { key: "bot_end_timing", value: botEnd, dataType: "string" },
            { key: "bot_timing_timezone", value: botTimezone, dataType: "string" },
            { key: "enable_automatic_message_deletion", value: String(autoDelete), dataType: "boolean" },
            { key: "delete_whatsapp_message_days", value: deleteDays, dataType: "integer" },
            { key: "vendor_api_access_token", value: apiAccessToken, dataType: "string" },
          ],
        }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  return (
    <PermissionGate permission="settings_access">
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Advanced Settings</h1>

      {/* Bot Timing Restrictions */}
      <section className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Bot Timing Restrictions</h2>
            <p className="text-sm text-gray-500">Only run bots during business hours.</p>
          </div>
          <button
            type="button"
            onClick={() => setBotTimingEnabled((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${botTimingEnabled ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${botTimingEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {botTimingEnabled && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Start Time</label>
              <input type="time" value={botStart} onChange={(e) => setBotStart(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">End Time</label>
              <input type="time" value={botEnd} onChange={(e) => setBotEnd(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Timezone</label>
              <select value={botTimezone} onChange={(e) => setBotTimezone(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm">
                <option value="Asia/Kolkata">IST (India)</option>
                <option value="Asia/Dubai">GST (Dubai)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">EST (New York)</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Auto Message Deletion */}
      <section className="border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Automatic Message Deletion</h2>
            <p className="text-sm text-gray-500">Delete messages older than N days to save storage.</p>
          </div>
          <button
            type="button"
            onClick={() => setAutoDelete((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoDelete ? "bg-green-500" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoDelete ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
        {autoDelete && (
          <div>
            <label className="block text-xs font-medium mb-1">Delete messages older than (days)</label>
            <input type="number" min="7" max="365" value={deleteDays} onChange={(e) => setDeleteDays(e.target.value)} className="w-32 border rounded px-3 py-1.5 text-sm" />
          </div>
        )}
      </section>

      {/* API Access Token */}
      <section className="border rounded-lg p-5 space-y-3">
        <h2 className="font-medium">API Access Token</h2>
        <p className="text-sm text-gray-500">Use this token to access TrustCRM API programmatically.</p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={apiAccessToken || "Generate a token to get started"}
            className="flex-1 border rounded px-3 py-1.5 text-sm bg-gray-50 font-mono text-xs"
          />
          <button
            onClick={() => {
              const token = crypto.randomUUID().replace(/-/g, "");
              setApiAccessToken(token);
            }}
            className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50"
          >
            Regenerate
          </button>
        </div>
      </section>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-6 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
      >
        {save.isPending ? "Saving..." : "Save Settings"}
      </button>
    </div>
    </PermissionGate>
  );
}
