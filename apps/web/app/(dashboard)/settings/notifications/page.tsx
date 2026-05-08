"use client";
import { JSX } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface VendorSettingsResponse {
  data: Record<string, string>;
}

export default function NotificationsPage(): JSX.Element {
  const qc = useQueryClient();

  const { data: settings } = useQuery<VendorSettingsResponse>({
    queryKey: ["vendor-settings"],
    queryFn: () => fetch("/api/v1/vendor-settings").then((r) => r.json() as Promise<VendorSettingsResponse>),
  });

  const isSoundDisabled = settings?.data?.["is_disabled_message_sound_notification"] === "true";

  const toggleSound = useMutation({
    mutationFn: (disabled: boolean) =>
      fetch("/api/v1/vendor-settings/sound-notification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <div className="border rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Message Sound</p>
          <p className="text-xs text-gray-500">Play a sound when a new message arrives in the inbox.</p>
        </div>
        <button
          type="button"
          onClick={() => toggleSound.mutate(isSoundDisabled ? false : true)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            !isSoundDisabled ? "bg-green-500" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              !isSoundDisabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
