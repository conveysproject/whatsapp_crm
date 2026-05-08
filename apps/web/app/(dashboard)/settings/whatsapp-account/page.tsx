"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function WhatsAppAccountPage(): JSX.Element {
  const qc = useQueryClient();

  const { data: health } = useQuery({
    queryKey: ["wa-health"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/health-status"),
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["wa-profile"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/business-profile"),
  });

  const [about, setAbout] = useState("");
  const [address, setAddress] = useState("");

  const updateProfile = useMutation({
    mutationFn: (body: { about: string; address: string }) =>
      fetch("/api/v1/whatsapp-account/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-profile"] }),
  });

  const syncPhones = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/sync-phone-numbers", { method: "POST" }).then((r) => r.json()),
  });

  const disconnect = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/disconnect-account", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-health"] }),
  });

  const healthData = health as { data?: { status?: string } } | undefined;
  const profileData = profile as { data?: { about?: string; address?: string } } | undefined;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp Account</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your WhatsApp Business connection
        </p>
      </div>

      {/* Health Status */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-medium">Connection Status</h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              healthData?.data?.status === "connected" ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm capitalize">{healthData?.data?.status ?? "checking..."}</span>
        </div>
      </section>

      {/* Business Profile */}
      <section className="border rounded-lg p-4 space-y-4">
        <h2 className="font-medium">Business Profile</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">About</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
                defaultValue={profileData?.data?.about ?? ""}
                onChange={(e) => setAbout(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                defaultValue={profileData?.data?.address ?? ""}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <button
              onClick={() => updateProfile.mutate({ about, address })}
              disabled={updateProfile.isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {updateProfile.isPending ? "Saving..." : "Save Profile"}
            </button>
          </>
        )}
      </section>

      {/* Phone Numbers */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-medium">Phone Numbers</h2>
        <button
          onClick={() => syncPhones.mutate()}
          disabled={syncPhones.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {syncPhones.isPending ? "Syncing..." : "Sync from Meta"}
        </button>
      </section>

      {/* Danger Zone */}
      <section className="border border-red-200 rounded-lg p-4 space-y-2">
        <h2 className="font-medium text-red-600">Danger Zone</h2>
        <p className="text-sm text-gray-500">Disconnect your WhatsApp account from TrustCRM.</p>
        <button
          onClick={() => {
            if (confirm("Disconnect WhatsApp account? You will stop receiving messages.")) {
              disconnect.mutate();
            }
          }}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          Disconnect Account
        </button>
      </section>
    </div>
  );
}
