"use client";
import { JSX, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConnectWhatsAppModal, type ConnectResult } from "@/components/whatsapp/ConnectWhatsAppModal";
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
    whatsapp_business_account_id?: string;
    current_phone_number_number?: string;
    current_phone_number_id?: string;
    facebook_app_id?: string;
    facebook_page_id?: string;
    instagram_account_id?: string;
    meta_business_id?: string;
    webhook_verified_at?: string;
    phone_info_messaging_limit_tier?: string;
    phone_info_status?: string;
    phone_info_quality_rating?: string;
    phone_info_is_on_biz_app?: string;
    phone_info_is_pin_enabled?: string;
    phone_info_last_onboarded_time?: string;
    phone_info_synced_at?: string;
    waba_business_verification_status?: string;
    waba_account_review_status?: string;
    business_profile_about?: string;
    business_profile_address?: string;
    business_profile_email?: string;
    business_profile_description?: string;
    business_profile_picture_url?: string;
    business_profile_vertical?: string;
    business_profile_websites?: string;
    business_profile_synced_at?: string;
    meta_health_status?: string;
    meta_health_checked_at?: string;
    display_name?: string;
    display_name_status?: string;
    new_display_name?: string;
    new_display_name_status?: string;
    marketing_messages_enabled?: string;
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

const TIER_LABEL: Record<string, string> = {
  TIER_50: "50 / day",
  TIER_250: "250 / day",
  TIER_1K: "1,000 / day",
  TIER_10K: "10,000 / day",
  TIER_100K: "100,000 / day",
  TIER_UNLIMITED: "Unlimited",
};

const VERTICAL_LABEL: Record<string, string> = {
  ALCOHOL: "Alcoholic Beverages",
  APPAREL: "Clothing and Apparel",
  AUTO: "Automotive",
  BEAUTY: "Beauty, Spa and Salon",
  EDU: "Education",
  ENTERTAIN: "Entertainment",
  EVENT_PLAN: "Event Planning and Service",
  FINANCE: "Finance and Banking",
  GOVT: "Public Service",
  GROCERY: "Food and Grocery",
  HEALTH: "Medical and Health",
  HOTEL: "Hotel and Lodging",
  NONPROFIT: "Non-profit",
  ONLINE_GAMBLING: "Online Gambling & Gaming",
  OTC_DRUGS: "Over-the-Counter Drugs",
  OTHER: "Other",
  PHYSICAL_GAMBLING: "Non-Online Gambling & Gaming",
  PROF_SERVICES: "Professional Services",
  RESTAURANT: "Restaurant",
  RETAIL: "Shopping and Retail",
  TRAVEL: "Travel and Transportation",
};

function StatusBadge({ status }: { status: string | undefined }) {
  const map: Record<string, { dot: string; text: string; label: string }> = {
    CONNECTED: { dot: "bg-green-500", text: "text-green-700", label: "Active" },
    FLAGGED: { dot: "bg-red-500", text: "text-red-700", label: "Flagged" },
    PENDING: { dot: "bg-yellow-400", text: "text-yellow-700", label: "Pending" },
    RESTRICTED: { dot: "bg-orange-500", text: "text-orange-700", label: "Restricted" },
  };
  const s = status ? (map[status] ?? { dot: "bg-gray-400", text: "text-gray-600", label: status }) : null;
  if (!s) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | undefined | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className={`text-sm text-right font-medium text-gray-900 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// ── WhatsApp logo SVG ──────────────────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

export default function WhatsAppAccountPage(): JSX.Element {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [disconnectResult, setDisconnectResult] = useState<DisconnectResult | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [about, setAbout] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [vertical, setVertical] = useState("");
  const [websites, setWebsites] = useState<string[]>(["", ""]);

  const syncAll = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/sync-all", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["vendor-settings"] }),
  });

  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      setJustConnected(true);
      router.replace("/settings/whatsapp-account");
      syncAll.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data: vsRaw, isLoading: vsLoading } = useQuery({
    queryKey: ["vendor-settings"],
    queryFn: () => fetchJson("/api/v1/vendor-settings"),
  });
  const vs = vsRaw as VendorSettings | undefined;
  const s = vs?.data;

  const isConnected = Boolean(s?.whatsapp_business_account_id);
  const neverSynced = !s?.phone_info_synced_at;

  const updateProfile = useMutation({
    mutationFn: (body: { about: string; address: string; description: string; email: string; vertical: string; websites: string[] }) =>
      fetch("/api/v1/whatsapp-account/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, websites: body.websites.filter(Boolean) }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
      setEditingProfile(false);
    },
  });

  const disconnect = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/disconnect-account", { method: "POST" }).then((r) => r.json()),
    onSuccess: (res: unknown) => {
      void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
      const result = (res as { data?: { cleared?: DisconnectResult } })?.data?.cleared;
      if (result) setDisconnectResult(result);
    },
  });

  const syncPhones = useMutation({
    mutationFn: () =>
      fetch("/api/v1/whatsapp-account/sync-phone-numbers", { method: "POST" })
        .then((r) => r.json() as Promise<{ data?: Array<{ id: string; displayPhoneNumber: string; verifiedName: string }> }>),
  });

  return (
    <PermissionGate permission="settings_access" sub="settings_whatsapp">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Success banner ──────────────────────────────────────── */}
        {justConnected && (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
            <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-green-800 font-medium">
              WhatsApp account connected.{" "}
              {syncAll.isPending ? "Syncing latest data from Meta…" : "Data synced."}
            </p>
            <button type="button" onClick={() => setJustConnected(false)} className="ml-auto text-green-500 hover:text-green-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* WhatsApp logo circle */}
            <div className="w-14 h-14 rounded-2xl bg-[#25D366] flex items-center justify-center shrink-0 shadow-sm">
              <WhatsAppIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900">
                  {s?.display_name ?? "WhatsApp Business"}
                </h1>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-green-200">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-500 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    Not connected
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {s?.current_phone_number_number
                  ? `${s.current_phone_number_number}`
                  : "No phone number connected"}
                {s?.whatsapp_business_account_id && (
                  <span className="ml-2 font-mono text-xs text-gray-400">WABA {s.whatsapp_business_account_id}</span>
                )}
              </p>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isConnected && (
              <button
                onClick={() => syncAll.mutate()}
                disabled={syncAll.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-700"
              >
                <svg className={`w-4 h-4 ${syncAll.isPending ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {syncAll.isPending ? "Syncing…" : "Sync"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowConnectModal(true)}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {isConnected ? "Re-connect" : "Connect with Meta"}
            </button>
          </div>
        </div>

        {/* ── Never-synced notice ─────────────────────────────────── */}
        {isConnected && neverSynced && !vsLoading && (
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-800">Account data not yet synced from Meta.
              <button onClick={() => syncAll.mutate()} className="ml-1 underline font-medium">Sync now</button>
            </p>
          </div>
        )}

        {/* ── Stat cards row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Phone Status */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone Status</p>
            <StatusBadge status={s?.phone_info_status} />
            <p className="text-xs text-gray-400 font-mono truncate">{s?.current_phone_number_number ?? "—"}</p>
          </div>

          {/* Messaging Limit */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Messaging Limit</p>
            <p className="text-sm font-semibold text-gray-900">
              {s?.phone_info_messaging_limit_tier
                ? (TIER_LABEL[s.phone_info_messaging_limit_tier] ?? s.phone_info_messaging_limit_tier)
                : "—"}
            </p>
            <p className="text-xs text-gray-400">Conversations per day</p>
          </div>

          {/* Quality Rating */}
          <div className={`rounded-xl border shadow-sm p-4 space-y-1.5 ${
            s?.phone_info_quality_rating === "RED"    ? "bg-red-50 border-red-200" :
            s?.phone_info_quality_rating === "YELLOW" ? "bg-amber-50 border-amber-200" :
            s?.phone_info_quality_rating === "GREEN"  ? "bg-green-50 border-green-200" :
            "bg-white border-gray-200"
          }`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quality Rating</p>
            {s?.phone_info_quality_rating && s.phone_info_quality_rating !== "UNKNOWN" ? (
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                s.phone_info_quality_rating === "GREEN" ? "text-green-700" :
                s.phone_info_quality_rating === "RED"   ? "text-red-700" :
                s.phone_info_quality_rating === "YELLOW" ? "text-amber-700" :
                "text-gray-600"
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  s.phone_info_quality_rating === "GREEN"  ? "bg-green-500" :
                  s.phone_info_quality_rating === "RED"    ? "bg-red-500" :
                  s.phone_info_quality_rating === "YELLOW" ? "bg-amber-400" :
                  "bg-gray-400"
                }`} />
                {s.phone_info_quality_rating === "GREEN" ? "High" :
                 s.phone_info_quality_rating === "YELLOW" ? "Medium" :
                 s.phone_info_quality_rating === "RED" ? "Low" :
                 s.phone_info_quality_rating}
              </span>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
            <p className="text-xs text-gray-400">User feedback score</p>
          </div>

          {/* Messaging Health */}
          <div className={`rounded-xl border shadow-sm p-4 space-y-1.5 ${
            s?.meta_health_status === "BLOCKED" || s?.meta_health_status === "UNAVAILABLE"
              ? "bg-red-50 border-red-200"
              : "bg-white border-gray-200"
          }`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Messaging Health</p>
            {s?.meta_health_status ? (
              <>
                {(() => {
                  const h = s.meta_health_status;
                  const isGood = h === "ENABLED" || h === "AVAILABLE";
                  const isBad  = h === "BLOCKED" || h === "UNAVAILABLE";
                  const dotCls = isGood ? "bg-green-500" : isBad ? "bg-red-500" : "bg-yellow-400";
                  const txtCls = isGood ? "text-green-700" : isBad ? "text-red-700 font-bold" : "text-yellow-700";
                  return (
                    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${txtCls}`}>
                      <span className={`w-2 h-2 rounded-full ${dotCls}`} />
                      {h}
                    </span>
                  );
                })()}
                {s.meta_health_checked_at && (
                  <p className="text-xs text-gray-400">Checked {formatRelativeTime(s.meta_health_checked_at)}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>
        </div>

        {/* ── Main 2-column layout ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Left column (wider) */}
          <div className="lg:col-span-3 space-y-5">

            {/* Business Profile card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Business Profile</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      showPreview
                        ? "bg-gray-900 text-white border-gray-900"
                        : "text-gray-500 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {showPreview ? "Hide preview" : "Preview"}
                  </button>
                {!editingProfile && (
                  <button
                    onClick={() => {
                      setAbout(s?.business_profile_about ?? "");
                      setAddress(s?.business_profile_address ?? "");
                      setDescription(s?.business_profile_description ?? "");
                      setEmail(s?.business_profile_email ?? "");
                      setVertical(s?.business_profile_vertical ?? "");
                      const ws = (() => { try { return JSON.parse(s?.business_profile_websites ?? "[]") as string[]; } catch { return []; } })();
                      setWebsites([ws[0] ?? "", ws[1] ?? ""]);
                      setEditingProfile(true);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Edit
                  </button>
                )}
                </div>
              </div>

              <div className={showPreview ? "flex" : ""}>
              <div className={showPreview ? "flex-1 min-w-0" : ""}>
              {/* Profile header */}
              <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100">
                {s?.business_profile_picture_url ? (
                  <img src={s.business_profile_picture_url} alt="Profile" className="w-14 h-14 rounded-full object-cover border border-gray-200" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xl font-bold">
                      {(s?.display_name ?? "W").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{s?.display_name ?? "—"}</p>
                  {s?.business_profile_vertical && (
                    <p className="text-sm text-gray-500">
                      {VERTICAL_LABEL[s.business_profile_vertical] ?? s.business_profile_vertical}
                    </p>
                  )}
                  {s?.display_name_status && (s.display_name_status === "REJECTED" || s.display_name_status === "PENDING_REVIEW") && (
                    <span className={`mt-1 inline-flex text-xs px-2 py-0.5 rounded-full ${
                      s.display_name_status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      Name: {s.display_name_status}
                    </span>
                  )}
                </div>
              </div>

              {editingProfile ? (
                <div className="px-5 py-4 space-y-4">
                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={vertical}
                      onChange={(e) => setVertical(e.target.value)}
                    >
                      <option value="">Select a category</option>
                      <option value="ALCOHOL">Alcoholic Beverages</option>
                      <option value="APPAREL">Clothing and Apparel</option>
                      <option value="AUTO">Automotive</option>
                      <option value="BEAUTY">Beauty, Spa and Salon</option>
                      <option value="EDU">Education</option>
                      <option value="ENTERTAIN">Entertainment</option>
                      <option value="EVENT_PLAN">Event Planning and Service</option>
                      <option value="FINANCE">Finance and Banking</option>
                      <option value="GOVT">Public Service</option>
                      <option value="GROCERY">Food and Grocery</option>
                      <option value="HEALTH">Medical and Health</option>
                      <option value="HOTEL">Hotel and Lodging</option>
                      <option value="NONPROFIT">Non-profit</option>
                      <option value="ONLINE_GAMBLING">Online Gambling &amp; Gaming</option>
                      <option value="OTC_DRUGS">Over-the-Counter Drugs</option>
                      <option value="OTHER">Other</option>
                      <option value="PHYSICAL_GAMBLING">Non-Online Gambling &amp; Gaming</option>
                      <option value="PROF_SERVICES">Professional Services</option>
                      <option value="RESTAURANT">Restaurant</option>
                      <option value="RETAIL">Shopping and Retail</option>
                      <option value="TRAVEL">Travel and Transportation</option>
                    </select>
                  </div>
                  {/* About */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">About</label>
                      <span className="text-xs text-gray-400">{about.length}/139</span>
                    </div>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={2}
                      maxLength={139}
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                      placeholder="Appears beneath your profile image"
                    />
                  </div>
                  {/* Description */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">Description</label>
                      <span className="text-xs text-gray-400">{description.length}/512</span>
                    </div>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      rows={3}
                      maxLength={512}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Description of your business"
                    />
                  </div>
                  {/* Address */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">Address</label>
                      <span className="text-xs text-gray-400">{address.length}/256</span>
                    </div>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={256}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Business address"
                    />
                  </div>
                  {/* Email */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">Email</label>
                      <span className="text-xs text-gray-400">{email.length}/128</span>
                    </div>
                    <input
                      type="email"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={128}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@yourbusiness.com"
                    />
                  </div>
                  {/* Websites */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Websites (max 2)</label>
                    {[0, 1].map((i) => (
                      <input
                        key={i}
                        type="url"
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${i === 1 ? "mt-2" : ""}`}
                        maxLength={256}
                        value={websites[i] ?? ""}
                        onChange={(e) => { const w = [...websites]; w[i] = e.target.value; setWebsites(w); }}
                        placeholder={`https://www.example.com${i === 1 ? " (optional)" : ""}`}
                      />
                    ))}
                    <p className="text-xs text-gray-400 mt-1">Must start with https://</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => updateProfile.mutate({ about, address, description, email, vertical, websites })}
                      disabled={updateProfile.isPending}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updateProfile.isPending ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      onClick={() => setEditingProfile(false)}
                      className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-1 divide-y divide-gray-100">
                  <InfoRow label="About" value={s?.business_profile_about} />
                  <InfoRow label="Description" value={s?.business_profile_description} />
                  <InfoRow label="Address" value={s?.business_profile_address} />
                  <InfoRow label="Email" value={s?.business_profile_email} />
                  {(() => {
                    try {
                      const ws = JSON.parse(s?.business_profile_websites ?? "[]") as string[];
                      return ws.filter(Boolean).map((url, i) => (
                        <div key={i} className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 last:border-0">
                          <span className="text-sm text-gray-500 shrink-0">Website {ws.filter(Boolean).length > 1 ? i + 1 : ""}</span>
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline text-right break-all">{url}</a>
                        </div>
                      ));
                    } catch { return null; }
                  })()}
                  {!s?.business_profile_about && !s?.business_profile_address && !s?.business_profile_email && !s?.business_profile_description && (
                    <p className="py-4 text-sm text-gray-400 text-center">
                      {neverSynced ? "Sync from Meta to load profile data." : "No profile information set."}
                    </p>
                  )}
                </div>
              )}

              {/* Pending display name change */}
              {s?.new_display_name && (
                <div className="flex items-center gap-3 mx-5 mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-amber-800">Display name change pending: <strong>{s.new_display_name}</strong></span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                    s.new_display_name_status === "APPROVED" ? "bg-green-100 text-green-700" :
                    s.new_display_name_status === "REJECTED" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{s.new_display_name_status ?? "PENDING"}</span>
                </div>
              )}
              </div>{/* end left pane */}

              {/* Phone preview panel */}
              {showPreview && (
                <div className="w-56 shrink-0 border-l border-gray-100 bg-gray-50 flex flex-col items-center justify-start py-6 px-3">
                  <p className="text-xs text-gray-400 mb-4 font-medium">Customer view</p>
                  <WhatsAppPhonePreview
                    name={s?.display_name ?? "Business Name"}
                    phone={s?.current_phone_number_number ?? ""}
                    about={s?.business_profile_about ?? ""}
                    pictureUrl={s?.business_profile_picture_url}
                    website={(() => { try { const ws = JSON.parse(s?.business_profile_websites ?? "[]") as string[]; return ws[0] ?? ""; } catch { return ""; } })()}
                  />
                </div>
              )}
              </div>{/* end preview flex row */}
            </div>

            {/* Phone numbers card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Phone Numbers</h2>
                <button
                  onClick={() => syncPhones.mutate()}
                  disabled={syncPhones.isPending}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                >
                  {syncPhones.isPending ? "Syncing…" : "Sync from Meta"}
                </button>
              </div>

              {/* Current phone (from cache) */}
              {s?.current_phone_number_number ? (
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                      <WhatsAppIcon className="w-4.5 h-4.5 text-green-600 w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{s.current_phone_number_number}</p>
                      <p className="text-xs text-gray-400 font-mono">{s.current_phone_number_id ?? "—"}</p>
                    </div>
                  </div>
                  <StatusBadge status={s?.phone_info_status ?? "CONNECTED"} />
                </div>
              ) : (
                <p className="px-5 py-4 text-sm text-gray-400">No phone number configured.</p>
              )}

              {/* Synced phone list */}
              {syncPhones.isSuccess && (() => {
                const phones = syncPhones.data?.data ?? [];
                return phones.length > 1 ? (
                  <div className="border-t border-gray-100 divide-y divide-gray-100">
                    {phones.slice(1).map((p) => (
                      <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.displayPhoneNumber}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.id}</p>
                        </div>
                        <span className="text-xs text-gray-500">{p.verifiedName}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>

            {/* Connected channels card */}
            <ConnectedChannelsCard settings={s} />
          </div>

          {/* Right column (narrower) */}
          <div className="lg:col-span-2 space-y-5">

            {/* Account details card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Account Details</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-gray-100">
                <InfoRow label="WABA ID" value={s?.whatsapp_business_account_id} mono />
                <InfoRow label="Phone ID" value={s?.current_phone_number_id} mono />
                <InfoRow label="App ID" value={s?.facebook_app_id} mono />
                <InfoRow label="Business ID" value={s?.meta_business_id} mono />
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Webhook</span>
                  {s?.webhook_verified_at ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Active
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Not configured</span>
                  )}
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-sm text-gray-500">2-Step PIN</span>
                  {s?.phone_info_is_pin_enabled === "true" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Enabled
                    </span>
                  ) : s?.phone_info_is_pin_enabled === "false" ? (
                    <span className="text-xs font-medium text-red-600">Not enabled</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
                {s?.phone_info_last_onboarded_time && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Onboarded</span>
                    <span className="text-xs text-gray-700">{new Date(s.phone_info_last_onboarded_time).toLocaleDateString()}</span>
                  </div>
                )}
                {s?.waba_business_verification_status && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Business Verified</span>
                    <span className={`text-xs font-medium ${
                      s.waba_business_verification_status === "verified" ? "text-green-700" :
                      s.waba_business_verification_status === "not_verified" ? "text-red-600" :
                      "text-amber-600"
                    }`}>
                      {s.waba_business_verification_status === "verified" ? "Verified" :
                       s.waba_business_verification_status === "not_verified" ? "Not verified" :
                       s.waba_business_verification_status}
                    </span>
                  </div>
                )}
                {s?.waba_account_review_status && s.waba_account_review_status !== "APPROVED" && (
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Account Review</span>
                    <span className={`text-xs font-medium ${
                      s.waba_account_review_status === "PENDING" ? "text-amber-600" : "text-red-600"
                    }`}>{s.waba_account_review_status}</span>
                  </div>
                )}
                {s?.phone_info_is_on_biz_app === "true" && (
                  <div className="py-2.5 flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-amber-700">Still on Business App — migration needed</span>
                  </div>
                )}
              </div>
              {s?.phone_info_synced_at && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-400">Last synced {formatRelativeTime(s.phone_info_synced_at)}</p>
                </div>
              )}
            </div>

            {/* Marketing Messages card */}
            <MarketingMessagesCard />

            {/* QR Code card */}
            <QrCodeCard />

            {/* Advanced section (collapsible) */}
            <AdvancedSection />

            {/* Manual connect (collapsed by default) */}
            <ManualConnectCard onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ["vendor-settings"] });
              setJustConnected(true);
            }} />
          </div>
        </div>

        {/* ── Danger Zone ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-red-600">Disconnect Account</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Remove WBMSG&apos;s access to your WhatsApp Business Account. Incoming messages will stop.
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm("Disconnect WhatsApp account? You will stop receiving messages until you reconnect.")) {
                  disconnect.mutate();
                }
              }}
              disabled={disconnect.isPending || !isConnected}
              className="px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>

        {/* Modals */}
        {showConnectModal && (
          <ConnectWhatsAppModal
            flow="reconnect"
            onSuccess={(_result: ConnectResult) => {
              setShowConnectModal(false);
              setJustConnected(true);
              syncAll.mutate();
            }}
            onClose={() => setShowConnectModal(false)}
          />
        )}

        {disconnectResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-gray-900">WhatsApp Disconnected</h2>
              </div>
              <div className="space-y-1.5">
                {disconnectResult.phoneNumber && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Phone</span>
                    <span className="font-medium">{disconnectResult.phoneNumber}</span>
                  </div>
                )}
                {disconnectResult.wabaId && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">WABA ID</span>
                    <span className="font-mono text-xs">{disconnectResult.wabaId}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                  <span className="text-gray-500">Access token</span>
                  <span className="text-red-600 font-medium">Cleared</span>
                </div>
                {disconnectResult.webhookDisconnected && (
                  <div className="flex justify-between text-sm py-1.5">
                    <span className="text-gray-500">Webhook</span>
                    <span className="text-red-600 font-medium">Removed from Meta</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setDisconnectResult(null)}
                className="w-full py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}

// ── Phone preview ──────────────────────────────────────────────────────────────

function WhatsAppPhonePreview({ name, phone, about, pictureUrl, website }: {
  name: string; phone: string; about: string; pictureUrl?: string; website?: string;
}) {
  const initial = (name || "B").charAt(0).toUpperCase();
  return (
    /* Phone frame */
    <div className="relative w-44 rounded-[2rem] border-4 border-gray-800 bg-gray-800 shadow-2xl overflow-hidden" style={{ minHeight: 340 }}>
      {/* Status bar */}
      <div className="bg-gray-800 flex items-center justify-between px-4 pt-2 pb-1">
        <span className="text-white text-[9px] font-semibold">9:41</span>
        <div className="flex gap-1 items-center">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M1.5 8.5C5 5 10.5 3 12 3s7 2 10.5 5.5" /><path d="M5 12c1.9-1.9 4.4-3 7-3s5.1 1.1 7 3" /><path d="M8.5 15.5c.9-.9 2.2-1.5 3.5-1.5s2.6.6 3.5 1.5" /><circle cx="12" cy="19" r="1" /></svg>
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="11" rx="2" /><path d="M22 11h1a1 1 0 010 2h-1" /></svg>
        </div>
      </div>

      {/* WhatsApp header */}
      <div className="bg-[#075E54] px-3 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
        {pictureUrl ? (
          <img src={pictureUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{initial}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-white text-[11px] font-semibold leading-tight truncate">{name || "Business Name"}</p>
          <p className="text-[#b2dfdb] text-[9px] leading-tight">Business account</p>
        </div>
        <div className="ml-auto flex gap-2">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
        </div>
      </div>

      {/* Profile body */}
      <div className="bg-[#ECE5DD] flex-1">
        {/* Avatar + name block */}
        <div className="bg-white pt-5 pb-3 flex flex-col items-center gap-2 border-b border-gray-200">
          {pictureUrl ? (
            <img src={pictureUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-white shadow" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow">
              <span className="text-white text-2xl font-bold">{initial}</span>
            </div>
          )}
          <div className="text-center px-2">
            <p className="text-[12px] font-semibold text-gray-900 leading-tight">{name || "Business Name"}</p>
            {phone && <p className="text-[10px] text-gray-500 mt-0.5">{phone}</p>}
          </div>
        </div>

        {/* Info rows */}
        <div className="bg-white mt-2 divide-y divide-gray-100">
          {about && (
            <div className="px-3 py-2">
              <p className="text-[9px] text-[#075E54] font-medium mb-0.5">About</p>
              <p className="text-[10px] text-gray-700 leading-snug line-clamp-3">{about}</p>
            </div>
          )}
          {website && (
            <div className="px-3 py-2 flex items-center gap-2">
              <svg className="w-3 h-3 text-[#075E54] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p className="text-[10px] text-[#128C7E] truncate">{website.replace(/^https?:\/\//, "")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConnectedChannelsCard({ settings }: { settings: VendorSettings["data"] | undefined }) {
  const wabaId = settings?.whatsapp_business_account_id;
  const phoneNumber = settings?.current_phone_number_number;
  const pageId = settings?.facebook_page_id;
  const igId = settings?.instagram_account_id;

  const channels = [
    {
      name: "WhatsApp",
      connected: !!wabaId,
      detail: phoneNumber ?? wabaId,
      icon: (
        <div className="w-7 h-7 rounded-lg bg-[#25D366] flex items-center justify-center">
          <WhatsAppIcon className="w-4 h-4 text-white" />
        </div>
      ),
    },
    {
      name: "Messenger",
      connected: !!pageId,
      detail: pageId,
      icon: (
        <div className="w-7 h-7 rounded-lg bg-[#0084FF] flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259 6.559-6.963 3.13 3.259 5.889-3.259-6.559 6.963z" />
          </svg>
        </div>
      ),
    },
    {
      name: "Instagram",
      connected: !!igId,
      detail: igId,
      icon: (
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Connected Channels</h2>
        <p className="text-xs text-gray-400 mt-0.5">Channels from last Embedded Signup</p>
      </div>
      <div className="divide-y divide-gray-100">
        {channels.map((ch) => (
          <div key={ch.name} className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              {ch.icon}
              <div>
                <p className="text-sm font-medium text-gray-900">{ch.name}</p>
                {ch.detail && <p className="text-xs text-gray-400 font-mono truncate max-w-[120px]">{ch.detail}</p>}
              </div>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              ch.connected ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-400"
            }`}>
              {ch.connected ? "Connected" : "Not connected"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketingMessagesCard() {
  const qc = useQueryClient();
  const { data: statusData } = useQuery({
    queryKey: ["marketing-messages-status"],
    queryFn: () => fetchJson("/api/v1/vendor-settings/marketing-messages/status"),
  });
  const enabled = (statusData as { data?: { enabled: boolean } } | undefined)?.data?.enabled ?? false;

  const enable = useMutation({
    mutationFn: () =>
      fetch("/api/v1/vendor-settings/marketing-messages/enable", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["marketing-messages-status"] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Marketing Messages</h2>
          <p className="text-xs text-gray-400 mt-0.5">Smart delivery & template analytics</p>
        </div>
        {enabled ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Enabled
          </span>
        ) : (
          <button
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {enable.isPending ? "Enabling…" : "Enable"}
          </button>
        )}
      </div>
    </div>
  );
}

function QrCodeCard() {
  const { data, isError, refetch, isFetching } = useQuery({
    queryKey: ["wa-qr-code"],
    queryFn: () => fetchJson("/api/v1/whatsapp-account/qr-code?format=json"),
    enabled: false,
  });
  const qrUrl = (data as { data?: { qrDataUrl?: string; url?: string } } | undefined)?.data?.qrDataUrl;
  const waUrl = (data as { data?: { url?: string } } | undefined)?.data?.url;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">WhatsApp QR Code</h2>
          <p className="text-xs text-gray-400 mt-0.5">Let customers scan to start a chat</p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
        >
          {isFetching ? "Loading…" : qrUrl ? "Refresh" : "Generate"}
        </button>
      </div>
      {isError && <p className="px-5 py-3 text-xs text-red-500">Sync phone numbers first, then generate the QR code.</p>}
      {qrUrl && (
        <div className="flex flex-col items-center gap-3 px-5 py-4">
          <img src={qrUrl} alt="WhatsApp QR Code" className="w-40 h-40 rounded-lg border border-gray-100" />
          {waUrl && <p className="text-xs text-gray-400 font-mono break-all text-center">{waUrl}</p>}
          <a href={qrUrl} download="whatsapp-qr.png" className="text-xs text-blue-600 hover:underline">
            Download PNG
          </a>
        </div>
      )}
    </div>
  );
}

function AdvancedSection() {
  const [open, setOpen] = useState(false);

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

  const subscriptions = (subData as { data?: { data?: Array<{ id: string; name?: string }> } } | undefined)?.data?.data ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">Advanced / Webhooks</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          {/* Subscriptions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-700">WABA Subscriptions</p>
              <button onClick={() => void refetchSubs()} disabled={subFetching}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50">
                {subFetching ? "Loading…" : "Check"}
              </button>
            </div>
            {subscriptions.length > 0 ? (
              <ul className="space-y-1">
                {subscriptions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    {s.name ?? s.id}
                  </li>
                ))}
              </ul>
            ) : subData !== undefined ? (
              <p className="text-xs text-gray-400">No active subscriptions found.</p>
            ) : null}
          </div>

          {/* App webhook */}
          <div className="flex gap-2">
            <button onClick={() => setupAppWebhook.mutate()} disabled={setupAppWebhook.isPending}
              className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              {setupAppWebhook.isPending ? "Setting up…" : "Setup App Webhook"}
            </button>
            <button onClick={() => removeAppWebhook.mutate()} disabled={removeAppWebhook.isPending}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
              {removeAppWebhook.isPending ? "Removing…" : "Remove App Webhook"}
            </button>
          </div>

          {/* Clear phone webhook */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            <p className="text-xs font-medium text-gray-700">Phone Webhook Override</p>
            <p className="text-xs text-gray-400">Clear per-phone webhook URI so app-level webhook takes effect.</p>
            <button
              onClick={() => { if (confirm("Clear phone webhook override?")) clearWebhook.mutate(); }}
              disabled={clearWebhook.isPending}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {clearWebhook.isPending ? "Clearing…" : "Clear Override"}
            </button>
            {clearWebhook.isSuccess && <p className="text-xs text-green-600">Cleared.</p>}
            {clearWebhook.isError && <p className="text-xs text-red-500">Failed.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ManualConnectCard({ onSuccess }: { onSuccess: () => void }): JSX.Element {
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <span className="text-sm font-semibold text-gray-900">Manual Connect</span>
          <p className="text-xs text-gray-400 mt-0.5">Paste WABA ID + System User token directly</p>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">WABA ID <span className="text-red-500">*</span></label>
            <input value={wabaId} onChange={(e) => setWabaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123456789012345" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number ID <span className="text-gray-400">(optional)</span></label>
            <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Auto-detected if blank" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">System User Access Token <span className="text-red-500">*</span></label>
            <textarea value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3} placeholder="EAAVpz..." />
          </div>
          <button
            type="button"
            onClick={() => { setError(""); connect.mutate(); }}
            disabled={connect.isPending || !wabaId || !accessToken}
            className="w-full py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 disabled:opacity-50"
          >
            {connect.isPending ? "Connecting…" : "Connect"}
          </button>
        </div>
      )}
    </div>
  );
}
