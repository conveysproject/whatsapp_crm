"use client";
import { JSX, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmbeddedSignupButton } from "@/components/whatsapp/EmbeddedSignupButton";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface DisconnectResult {
  phoneNumber: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  webhookDisconnected: boolean;
}

export default function WhatsAppAccountPage(): JSX.Element {
  const qc = useQueryClient();
  const [disconnectResult, setDisconnectResult] = useState<DisconnectResult | null>(null);

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
    onSuccess: (res: unknown) => {
      void qc.invalidateQueries({ queryKey: ["wa-health"] });
      const result = (res as { data?: { cleared?: DisconnectResult } })?.data?.cleared;
      if (result) setDisconnectResult(result);
    },
  });

  const healthData = health as { data?: { status?: "healthy" | "degraded" | "disconnected"; conditions?: Record<string, boolean> } } | undefined;
  const profileData = profile as { data?: { about?: string; address?: string } } | undefined;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">

      {/* Disconnect success modal */}
      {disconnectResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg font-bold">!</span>
              <h2 className="text-lg font-semibold">WhatsApp Account Disconnected</h2>
            </div>
            <p className="text-sm text-gray-500">The following data has been cleared from TrustCRM:</p>
            <ul className="text-sm space-y-2">
              {disconnectResult.phoneNumber && (
                <li className="flex justify-between border-b pb-1">
                  <span className="text-gray-500">Phone number</span>
                  <span className="font-medium">{disconnectResult.phoneNumber}</span>
                </li>
              )}
              {disconnectResult.phoneNumberId && (
                <li className="flex justify-between border-b pb-1">
                  <span className="text-gray-500">Phone number ID</span>
                  <span className="font-medium font-mono text-xs">{disconnectResult.phoneNumberId}</span>
                </li>
              )}
              {disconnectResult.wabaId && (
                <li className="flex justify-between border-b pb-1">
                  <span className="text-gray-500">WhatsApp Business Account ID</span>
                  <span className="font-medium font-mono text-xs">{disconnectResult.wabaId}</span>
                </li>
              )}
              <li className="flex justify-between border-b pb-1">
                <span className="text-gray-500">Access token</span>
                <span className="font-medium text-red-600">Cleared</span>
              </li>
              {disconnectResult.webhookDisconnected && (
                <li className="flex justify-between pb-1">
                  <span className="text-gray-500">Webhook</span>
                  <span className="font-medium text-red-600">Disconnected</span>
                </li>
              )}
            </ul>
            <p className="text-xs text-gray-400">You can reconnect at any time using the Connect button above.</p>
            <button
              onClick={() => setDisconnectResult(null)}
              className="w-full px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp Account</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your WhatsApp Business connection
        </p>
      </div>

      {/* Connect / Reconnect */}
      <section className="border rounded-lg p-4 space-y-3">
        <div>
          <h2 className="font-medium">Connect / Reconnect</h2>
          <p className="text-sm text-gray-500">Update your WhatsApp Business Account connection.</p>
        </div>
        <EmbeddedSignupButton
          flow="reconnect"
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["wa-health"] });
            void qc.invalidateQueries({ queryKey: ["wa-profile"] });
          }}
          onError={() => undefined}
        />
      </section>

      {/* Health Status */}
      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="font-medium">Connection Status</h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              healthData?.data?.status === "healthy" ? "bg-green-500" :
              healthData?.data?.status === "degraded" ? "bg-yellow-500" : "bg-red-500"
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
              <label htmlFor="wa-about" className="block text-sm font-medium mb-1">About</label>
              <textarea
                id="wa-about"
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
                defaultValue={profileData?.data?.about ?? ""}
                onChange={(e) => setAbout(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="wa-address" className="block text-sm font-medium mb-1">Address</label>
              <input
                id="wa-address"
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

      {/* Marketing Messages */}
      <MarketingMessagesSection />

      {/* QR Code */}
      <QrCodeSection />

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

function QrCodeSection(): JSX.Element {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["wa-qr-code"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/qr-code"),
    enabled: false,
  });
  const qrData = data as { data?: { data?: { url?: string }[] } } | undefined;
  const qrUrl = qrData?.data?.data?.[0]?.url;

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <div>
        <h2 className="font-medium">WhatsApp QR Code</h2>
        <p className="text-sm text-gray-500">Your business QR code for customers to start a conversation.</p>
      </div>
      <button
        onClick={() => void refetch()}
        disabled={isFetching}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isFetching ? "Loading…" : isLoading && !data ? "Load QR Code" : "Refresh QR Code"}
      </button>
      {isError && <p className="text-xs text-red-500">Failed to load QR code. Ensure WhatsApp is connected.</p>}
      {qrUrl && (
        <div className="flex flex-col items-start gap-2">
          <img src={qrUrl} alt="WhatsApp QR Code" className="w-48 h-48 border rounded" />
          <a href={qrUrl} download="whatsapp-qr.png" className="text-xs text-blue-600 hover:underline">
            Download QR Code
          </a>
        </div>
      )}
      {data !== undefined && !qrUrl && !isError && (
        <p className="text-xs text-gray-400">No QR code available for this account.</p>
      )}
    </section>
  );
}

function MarketingMessagesSection(): JSX.Element {
  const qc = useQueryClient();
  const { data: statusData } = useQuery({
    queryKey: ["marketing-messages-status"],
    queryFn: () => fetchJson("/api/v1/vendor-settings/marketing-messages/status"),
  });
  const status = statusData as { data?: { enabled: boolean } } | undefined;
  const enabled = status?.data?.enabled ?? false;

  const enable = useMutation({
    mutationFn: () =>
      fetch("/api/v1/vendor-settings/marketing-messages/enable", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-messages-status"] }),
  });

  return (
    <section className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Marketing Messages</h2>
          <p className="text-sm text-gray-500">Enable Meta template analytics and smart delivery for marketing campaigns.</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
          {enabled ? "Enabled" : "Not enabled"}
        </span>
      </div>
      {!enabled && (
        <button
          onClick={() => enable.mutate()}
          disabled={enable.isPending}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
        >
          {enable.isPending ? "Enabling…" : "Enable Marketing Messages"}
        </button>
      )}
      {enable.isError && (
        <p className="text-xs text-red-500">Failed to enable. Check your WhatsApp connection.</p>
      )}
    </section>
  );
}
