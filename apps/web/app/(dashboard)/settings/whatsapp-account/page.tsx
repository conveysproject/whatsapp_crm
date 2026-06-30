"use client";
import { JSX, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConnectWhatsAppModal } from "@/components/whatsapp/ConnectWhatsAppModal";
import { PermissionGate } from "@/components/PermissionGate";

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

type VendorSettings = {
  data?: {
    // Connection
    whatsapp_business_account_id?: string;
    current_phone_number_number?: string;
    facebook_page_id?: string;
    instagram_account_id?: string;
    meta_business_id?: string;
    // Phone info (cached from Meta)
    phone_info_messaging_limit_tier?: string;
    phone_info_status?: string;
    phone_info_is_on_biz_app?: string;
    phone_info_is_pin_enabled?: string;
    phone_info_last_onboarded_time?: string;
    phone_info_synced_at?: string;
    // Business profile (cached from Meta)
    business_profile_about?: string;
    business_profile_address?: string;
    business_profile_email?: string;
    business_profile_description?: string;
    business_profile_picture_url?: string;
    business_profile_vertical?: string;
    business_profile_synced_at?: string;
    // Health
    meta_health_status?: string;
    meta_health_checked_at?: string;
    // Display name
    display_name?: string;
    display_name_status?: string;
    new_display_name?: string;
    new_display_name_status?: string;
  };
};

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function WhatsAppAccountPage(): JSX.Element {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [disconnectResult, setDisconnectResult] = useState<DisconnectResult | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
      setJustConnected(true);
      router.replace("/settings/whatsapp-account");
    }
  }, [searchParams, qc, router]);

  // Single source of truth: vendor-settings cache
  const { data: vsRaw } = useQuery({
    queryKey: ["vendor-settings"],
    queryFn: () => fetchJson("/api/v1/vendor-settings"),
  });
  const vs = vsRaw as VendorSettings | undefined;
  const s = vs?.data;

  // Separate health-status query (checks DB config keys)
  const { data: health } = useQuery({
    queryKey: ["wa-health"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/health-status"),
  });
  const healthData = health as {
    data?: {
      status?: "healthy" | "degraded" | "disconnected";
      conditions?: Record<string, boolean>;
      metaHealthStatus?: string | null;
      metaHealthCheckedAt?: string | null;
      metaHealthStale?: boolean;
    };
  } | undefined;

  // "Sync from Meta" — the single refresh button
  const syncAll = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/sync-all", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
      void qc.invalidateQueries({ queryKey: ["wa-health"] });
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  const syncPhones = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/sync-phone-numbers", { method: "POST" })
        .then((r) => r.json() as Promise<{ data?: Array<{ id: string; displayPhoneNumber: string; verifiedName: string }> }>),
  });

  const disconnect = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/disconnect-account", { method: "POST" }).then((r) => r.json()),
    onSuccess: (res: unknown) => {
      void qc.invalidateQueries({ queryKey: ["wa-health"] });
      void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
      const result = (res as { data?: { cleared?: DisconnectResult } })?.data?.cleared;
      if (result) setDisconnectResult(result);
    },
  });

  const neverSynced = !s?.phone_info_synced_at;

  return (
    <PermissionGate permission="settings_access" sub="settings_whatsapp">
    <div className="max-w-2xl mx-auto p-6 space-y-8">

      {/* Reconnect success banner */}
      {justConnected && (
        <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-green-800 font-medium">WhatsApp account connected successfully.</p>
          <button type="button" onClick={() => setJustConnected(false)} className="ml-auto text-green-600 hover:text-green-800">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Disconnect success modal */}
      {disconnectResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg font-bold">!</span>
              <h2 className="text-lg font-semibold">WhatsApp Account Disconnected</h2>
            </div>
            <p className="text-sm text-gray-500">The following data has been cleared from WBMSG:</p>
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
        <button
          type="button"
          onClick={() => setShowConnectModal(true)}
          className="flex items-center justify-center gap-2 w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Connect with Meta
        </button>
      </section>

      {showConnectModal && (
        <ConnectWhatsAppModal
          flow="reconnect"
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
            void qc.invalidateQueries({ queryKey: ["wa-health"] });
            setShowConnectModal(false);
          }}
          onClose={() => setShowConnectModal(false)}
        />
      )}

      {/* Manual Connect */}
      <ManualConnectSection onSuccess={() => {
        void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
        void qc.invalidateQueries({ queryKey: ["wa-health"] });
        setJustConnected(true);
      }} />

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
        {healthData?.data?.metaHealthStatus && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Meta API:</span>
            <span className={`font-medium ${healthData.data.metaHealthStatus === "ENABLED" ? "text-green-600" : "text-yellow-600"}`}>
              {healthData.data.metaHealthStatus}
            </span>
            {healthData.data.metaHealthCheckedAt && (
              <span className="text-gray-400">checked {formatRelativeTime(healthData.data.metaHealthCheckedAt)}</span>
            )}
            {healthData.data.metaHealthStale && (
              <span className="text-orange-500">(stale)</span>
            )}
          </div>
        )}
      </section>

      {/* Sync from Meta — single refresh button */}
      <section className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Sync from Meta</h2>
            <p className="text-sm text-gray-500">
              Fetch all account data from the Meta API and update the cache.
              {s?.phone_info_synced_at && (
                <span className="ml-1 text-gray-400">Last synced {formatRelativeTime(s.phone_info_synced_at)}.</span>
              )}
            </p>
          </div>
          <button
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {syncAll.isPending ? "Syncing..." : "Sync from Meta"}
          </button>
        </div>
        {neverSynced && !syncAll.isPending && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            Data has never been synced from Meta. Click "Sync from Meta" to load your account details.
          </div>
        )}
        {syncAll.isError && (
          <p className="text-xs text-red-500">Sync failed. Ensure your WhatsApp account is connected.</p>
        )}
        {syncAll.isSuccess && (
          <p className="text-xs text-green-600">Sync complete. Data updated from Meta.</p>
        )}
      </section>

      {/* Business Profile — reads from vendorSettings cache */}
      <section className="border rounded-lg p-4 space-y-4">
        <h2 className="font-medium">Business Profile</h2>
        {neverSynced ? (
          <p className="text-sm text-gray-400">Sync from Meta to load your business profile.</p>
        ) : (
          <>
            <div>
              <label htmlFor="wa-about" className="block text-sm font-medium mb-1">About</label>
              <textarea
                id="wa-about"
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
                defaultValue={s?.business_profile_about ?? ""}
                onChange={(e) => setAbout(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="wa-address" className="block text-sm font-medium mb-1">Address</label>
              <input
                id="wa-address"
                className="w-full border rounded px-3 py-2 text-sm"
                defaultValue={s?.business_profile_address ?? ""}
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
      <section className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Phone Numbers</h2>
          <button
            onClick={() => syncPhones.mutate()}
            disabled={syncPhones.isPending}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {syncPhones.isPending ? "Syncing..." : "Sync from Meta"}
          </button>
        </div>
        {syncPhones.isSuccess && (
          (() => {
            const phones = syncPhones.data?.data ?? [];
            return phones.length === 0 ? (
              <p className="text-sm text-gray-500">No phone numbers found for this WABA.</p>
            ) : (
              <ul className="divide-y">
                {phones.map((p) => (
                  <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{p.displayPhoneNumber}</p>
                      <p className="text-gray-500 text-xs">{p.verifiedName} · ID: {p.id}</p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                  </li>
                ))}
              </ul>
            );
          })()
        )}
        {syncPhones.isError && (
          <p className="text-xs text-red-500">Sync failed. Ensure your WhatsApp account is connected.</p>
        )}
      </section>

      {/* Phone Status — reads from vendorSettings cache */}
      <PhoneStatusSection settings={s} />

      {/* Webhook Management */}
      <WebhookManagementSection />

      {/* Marketing Messages */}
      <MarketingMessagesSection />

      {/* Connected Channels */}
      <ConnectedChannelsSection settings={s} />

      {/* QR Code */}
      <QrCodeSection />

      {/* Danger Zone */}
      <section className="border border-red-200 rounded-lg p-4 space-y-2">
        <h2 className="font-medium text-red-600">Danger Zone</h2>
        <p className="text-sm text-gray-500">Disconnect your WhatsApp account from WBMSG.</p>
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
    </PermissionGate>
  );
}

function PhoneStatusSection({ settings }: { settings: VendorSettings["data"] | undefined }): JSX.Element {
  const tierLabel: Record<string, string> = {
    TIER_50: "50 conversations/day",
    TIER_250: "250 conversations/day",
    TIER_1K: "1,000 conversations/day",
    TIER_10K: "10,000 conversations/day",
    TIER_100K: "100,000 conversations/day",
    TIER_UNLIMITED: "Unlimited",
  };

  const status = settings?.phone_info_status;
  const tier = settings?.phone_info_messaging_limit_tier;
  const isPinEnabled = settings?.phone_info_is_pin_enabled === "true";
  const isOnBizApp = settings?.phone_info_is_on_biz_app === "true";
  const lastOnboardedTime = settings?.phone_info_last_onboarded_time;
  const syncedAt = settings?.phone_info_synced_at;

  const newDisplayName = settings?.new_display_name;
  const newDisplayNameStatus = settings?.new_display_name_status;

  const hasData = Boolean(status || tier);

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <div>
        <h2 className="font-medium">Phone Status (Meta)</h2>
        <p className="text-sm text-gray-500">
          Status from the Meta Graph API for this phone number.
          {syncedAt && <span className="ml-1 text-gray-400">Last synced {formatRelativeTime(syncedAt)}.</span>}
        </p>
      </div>
      {!hasData ? (
        <p className="text-sm text-gray-400">Use "Sync from Meta" above to load phone status.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500">Meta Status</dt>
          <dd>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              status === "CONNECTED" ? "bg-green-100 text-green-700" :
              status === "FLAGGED" ? "bg-red-100 text-red-700" :
              "bg-yellow-100 text-yellow-700"
            }`}>
              {status ?? "—"}
            </span>
          </dd>
          <dt className="text-gray-500">Messaging Limit</dt>
          <dd className="font-medium">{tier ? (tierLabel[tier] ?? tier) : "—"}</dd>
          <dt className="text-gray-500">Two-Step PIN</dt>
          <dd className={`font-medium ${isPinEnabled ? "text-green-600" : "text-red-500"}`}>{isPinEnabled ? "Enabled" : "Not enabled"}</dd>
          <dt className="text-gray-500">On Biz App</dt>
          <dd className={`font-medium ${isOnBizApp ? "text-yellow-600" : "text-gray-700"}`}>{isOnBizApp ? "Yes (needs migration)" : "No"}</dd>
          {lastOnboardedTime && (
            <>
              <dt className="text-gray-500">Last Onboarded</dt>
              <dd className="font-medium text-xs">{new Date(lastOnboardedTime).toLocaleString()}</dd>
            </>
          )}
        </dl>
      )}
      {(newDisplayName || newDisplayNameStatus) && (
        <div className="border-t pt-3 space-y-1">
          <p className="text-xs font-medium text-gray-600">Display Name Request</p>
          {newDisplayName && (
            <p className="text-sm">Requested: <span className="font-medium">{newDisplayName}</span></p>
          )}
          {newDisplayNameStatus && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              newDisplayNameStatus === "APPROVED" ? "bg-green-100 text-green-700" :
              newDisplayNameStatus === "REJECTED" ? "bg-red-100 text-red-700" :
              "bg-yellow-100 text-yellow-700"
            }`}>
              {newDisplayNameStatus}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function WebhookManagementSection(): JSX.Element {
  const { data: subData, isFetching: subFetching, refetch: refetchSubs } = useQuery({
    queryKey: ["wa-subscriptions"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/subscriptions"),
    enabled: false,
  });

  const clearWebhook = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/clear-phone-webhook", { method: "POST" }).then((r) => r.json()),
  });

  const setupAppWebhook = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/app-webhook", { method: "POST" }).then((r) => r.json()),
  });

  const removeAppWebhook = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/app-webhook", { method: "DELETE" }).then((r) => r.json()),
  });

  const subs = subData as { data?: { data?: Array<{ id: string; name?: string }> } } | undefined;
  const subscriptions = subs?.data?.data ?? [];

  return (
    <section className="border rounded-lg p-4 space-y-4">
      <div>
        <h2 className="font-medium">Webhook Management</h2>
        <p className="text-sm text-gray-500">Manage Meta webhook subscriptions for this account.</p>
      </div>

      {/* WABA subscriptions check */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">WABA Subscriptions</p>
          <button
            onClick={() => void refetchSubs()}
            disabled={subFetching}
            className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {subFetching ? "Loading…" : "Check"}
          </button>
        </div>
        {subscriptions.length > 0 ? (
          <ul className="text-xs text-gray-600 space-y-1">
            {subscriptions.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                {s.name ?? s.id}
              </li>
            ))}
          </ul>
        ) : subData !== undefined ? (
          <p className="text-xs text-gray-400">No active subscriptions found.</p>
        ) : null}
      </div>

      {/* App-level webhook */}
      <div className="flex gap-2">
        <button
          onClick={() => setupAppWebhook.mutate()}
          disabled={setupAppWebhook.isPending}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {setupAppWebhook.isPending ? "Setting up…" : "Setup App Webhook"}
        </button>
        <button
          onClick={() => removeAppWebhook.mutate()}
          disabled={removeAppWebhook.isPending}
          className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
        >
          {removeAppWebhook.isPending ? "Removing…" : "Remove App Webhook"}
        </button>
      </div>
      {(setupAppWebhook.isSuccess || removeAppWebhook.isSuccess) && (
        <p className="text-xs text-green-600">Done.</p>
      )}
      {(setupAppWebhook.isError || removeAppWebhook.isError) && (
        <p className="text-xs text-red-500">Operation failed. Check server logs.</p>
      )}

      {/* Clear phone-level webhook override */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-sm font-medium">Phone Webhook Override</p>
        <p className="text-xs text-gray-500">Clear any phone-number-level webhook URI override set during onboarding.</p>
        <button
          onClick={() => {
            if (confirm("Clear the phone-level webhook override? The app-level webhook will take over.")) {
              clearWebhook.mutate();
            }
          }}
          disabled={clearWebhook.isPending}
          className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {clearWebhook.isPending ? "Clearing…" : "Clear Phone Webhook Override"}
        </button>
        {clearWebhook.isSuccess && <p className="text-xs text-green-600">Phone webhook override cleared.</p>}
        {clearWebhook.isError && <p className="text-xs text-red-500">Failed to clear. Check connection.</p>}
      </div>
    </section>
  );
}

function QrCodeSection(): JSX.Element {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["wa-qr-code"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/qr-code?format=json"),
    enabled: false,
  });
  const qrData = data as { data?: { url?: string; qrDataUrl?: string } } | undefined;
  const qrUrl = qrData?.data?.qrDataUrl;

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
      {isError && <p className="text-xs text-red-500">Sync phone numbers first, then refresh the QR code.</p>}
      {qrUrl && (
        <div className="flex flex-col items-start gap-2">
          <img src={qrUrl} alt="WhatsApp QR Code" className="w-48 h-48 border rounded" />
          {qrData?.data?.url && (
            <p className="text-xs text-gray-500 font-mono break-all">{qrData.data.url}</p>
          )}
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

function ConnectedChannelsSection({ settings }: { settings: VendorSettings["data"] | undefined }): JSX.Element {
  const wabaId = settings?.whatsapp_business_account_id;
  const phoneNumber = settings?.current_phone_number_number;
  const pageId = settings?.facebook_page_id;
  const igId = settings?.instagram_account_id;
  const businessId = settings?.meta_business_id;

  return (
    <section className="border rounded-lg p-4 space-y-4">
      <div>
        <h2 className="font-medium">Connected Channels</h2>
        <p className="text-sm text-gray-500">Channels granted during the last Embedded Signup.</p>
      </div>

      <ChannelRow
        icon="💬"
        name="WhatsApp"
        connected={!!wabaId}
        detail={phoneNumber ?? wabaId ?? undefined}
      />
      <ChannelRow
        icon="💙"
        name="Messenger / Facebook Pages"
        connected={!!pageId}
        detail={pageId}
      />
      <ChannelRow
        icon="📷"
        name="Instagram"
        connected={!!igId}
        detail={igId}
      />

      {businessId && (
        <p className="text-xs text-gray-400">
          Meta Business ID: <span className="font-mono">{businessId}</span>
        </p>
      )}
    </section>
  );
}

function ChannelRow({
  icon,
  name,
  connected,
  detail,
}: {
  icon: string;
  name: string;
  connected: boolean;
  detail?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">{icon}</span>
        <div>
          <p className="text-sm font-medium">{name}</p>
          {detail && <p className="text-xs font-mono text-gray-400">{detail}</p>}
        </div>
      </div>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}
      >
        {connected ? "Connected" : "Not connected"}
      </span>
    </div>
  );
}

function ManualConnectSection({ onSuccess }: { onSuccess: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");

  const connect = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/connect-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wabaId, phoneNumberId: phoneNumberId || undefined, accessToken }),
      }).then((r) => r.json()),
    onSuccess: (res: unknown) => {
      const r = res as { error?: { message?: string } };
      if (r.error) { setError(r.error.message ?? "Failed"); return; }
      setOpen(false);
      setWabaId(""); setPhoneNumberId(""); setAccessToken(""); setError("");
      onSuccess();
    },
  });

  if (!open) {
    return (
      <section className="border border-dashed rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-sm">Manual Connect</h2>
            <p className="text-xs text-gray-500">Paste WABA ID + System User access token directly.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">
            Open
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm">Manual Connect</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium mb-1">WABA ID <span className="text-red-500">*</span></label>
          <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="e.g. 123456789012345" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Phone Number ID <span className="text-gray-400">(optional — auto-detected if blank)</span></label>
          <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm font-mono" placeholder="e.g. 1084186771447470" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">System User Access Token <span className="text-red-500">*</span></label>
          <textarea value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm font-mono text-xs" rows={3} placeholder="EAAVpz..." />
        </div>
      </div>
      <button
        type="button"
        onClick={() => { setError(""); connect.mutate(); }}
        disabled={connect.isPending || !wabaId || !accessToken}
        className="w-full py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
      >
        {connect.isPending ? "Connecting…" : "Connect"}
      </button>
    </section>
  );
}
