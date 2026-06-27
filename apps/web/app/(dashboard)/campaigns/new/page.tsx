"use client";

import { JSX, useState, useEffect } from "react";
import { MediaAssetPicker } from "@/components/media-asset-picker";
import type { MediaAsset } from "@/components/media-asset-picker";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-fetch";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { WhatsAppGate } from "@/components/WhatsAppGate";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Template { id: string; name: string; bodyText: string | null; language: string; status: string }
interface TemplateDetail { id: string; name: string; language: string; components: unknown[] }
interface Group { id: string; title: string; _count: { contacts: number } }
interface Segment { id: string; name: string }

type CampaignType = "template" | "non_template";
type AudienceMode = "all" | "groups" | "segment";
type ScheduleMode = "now" | "later";

const STEPS = ["Details", "Message", "Audience", "Launch"] as const;

export default function NewCampaignPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const { toast, toastState, setToastOpen } = useToast();

  // Step state
  const [step, setStep] = useState(1);

  // Form state
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("template");
  const [templateId, setTemplateId] = useState("");
  const [freeTextBody, setFreeTextBody] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [messageInterval, setMessageInterval] = useState(0);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [cardMediaUrls, setCardMediaUrls] = useState<string[]>([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  // Data fetching
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates-for-campaign"],
    queryFn: async () => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/templates`, { token: token ?? "", silent: true });
      if (!res.ok) return [];
      return (await res.json() as { data: Template[] }).data.filter((t) => t.status === "approved");
    },
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups-for-campaign"],
    queryFn: async () => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/contact-groups?limit=100`, { token: token ?? "", silent: true });
      if (!res.ok) return [];
      return (await res.json() as { data: Group[] }).data;
    },
  });

  const { data: segments = [] } = useQuery<Segment[]>({
    queryKey: ["segments-for-campaign"],
    queryFn: async () => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/segments`, { token: token ?? "", silent: true });
      if (!res.ok) return [];
      return (await res.json() as { data: Segment[] }).data;
    },
  });

  const { data: presets = [] } = useQuery<{ id: string; name: string; content: string }[]>({
    queryKey: ["preset-messages"],
    queryFn: async () => {
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/canned-responses?category=nt_campaign&limit=100`, {
        token: token ?? "",
        silent: true,
      });
      if (!res.ok) return [];
      return (await res.json() as { data: { id: string; name: string; content: string }[] }).data;
    },
    enabled: campaignType === "non_template",
  });

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const { data: templateDetail } = useQuery<TemplateDetail | null>({
    queryKey: ["template-detail", templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const token = await getToken();
      const res = await clientFetch(`${API_URL}/v1/templates/${templateId}`, { token: token ?? "", silent: true });
      if (!res.ok) return null;
      return (await res.json() as { data: TemplateDetail }).data;
    },
    enabled: !!templateId,
  });

  const carouselCardCount = (() => {
    if (!templateDetail) return 0;
    const carousel = (templateDetail.components as Array<{ type?: string; cards?: unknown[] }>)
      .find((c) => (c.type ?? "").toUpperCase() === "CAROUSEL");
    if (!carousel?.cards) return 0;
    return (carousel.cards as Array<{ components?: Array<{ type?: string; format?: string }> }>)
      .filter((card) =>
        card.components?.some(
          (cc) => (cc.type ?? "").toUpperCase() === "HEADER" &&
            ["IMAGE", "VIDEO", "DOCUMENT"].includes((cc.format ?? "").toUpperCase())
        )
      ).length;
  })();

  // Resize card URLs array when carousel card count changes, preserving existing entries
  useEffect(() => {
    setCardMediaUrls((prev) =>
      Array.from({ length: carouselCardCount }, (_, i) => prev[i] ?? "")
    );
  }, [carouselCardCount]);

  const estimatedCount = audienceMode === "groups"
    ? groups.filter((g) => selectedGroupIds.includes(g.id)).reduce((sum, g) => sum + g._count.contacts, 0)
    : null;

  function canAdvance(): boolean {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) {
      if (campaignType !== "template") return freeTextBody.trim().length > 0;
      if (!templateId) return false;
      if (carouselCardCount > 0) return cardMediaUrls.slice(0, carouselCardCount).every((u) => u.trim().length > 0);
      return true;
    }
    if (step === 3) {
      if (audienceMode === "groups") return selectedGroupIds.length > 0;
      if (audienceMode === "segment") return segmentId !== "";
      return true;
    }
    return true;
  }

  async function handleLaunch() {
    setSaving(true);
    try {
      const token = await getToken();

      const createRes = await clientFetch(`${API_URL}/v1/campaigns`, {
        method: "POST",
        token: token ?? "",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          campaignType,
          templateId: campaignType === "template" ? templateId : undefined,
          textBody: campaignType === "non_template" ? freeTextBody : undefined,
          messageInterval: messageInterval > 0 ? messageInterval : undefined,
          contactGroup: audienceMode === "groups" ? selectedGroupIds : undefined,
          mediaUrl: campaignType === "template" && mediaUrl && carouselCardCount === 0 ? mediaUrl : undefined,
          cardMediaUrls: campaignType === "template" && carouselCardCount > 0 && cardMediaUrls.some(Boolean)
            ? cardMediaUrls
            : undefined,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json() as { error?: { message?: string } };
        toast(err.error?.message ?? "Failed to create campaign", { variant: "error" });
        setSaving(false);
        return;
      }

      const { data } = await createRes.json() as { data: { id: string } };

      const scheduleRes = await clientFetch(`${API_URL}/v1/campaigns/${data.id}/schedule`, {
        method: "POST",
        token: token ?? "",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId: audienceMode === "segment" ? segmentId : undefined,
          scheduledAt: scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });

      if (!scheduleRes.ok) {
        const err = await scheduleRes.json() as { error?: { message?: string } };
        toast(err.error?.message ?? "Failed to schedule campaign", { variant: "error" });
        setSaving(false);
        return;
      }

      router.push("/campaigns");
    } catch {
      toast("An unexpected error occurred", { variant: "error" });
      setSaving(false);
    }
  }

  return (
    <PermissionGate permission="campaigns_access" sub="campaigns_create">
    <WhatsAppGate feature="Campaigns">
      <div className="min-h-screen bg-gray-50/60">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

          {/* Breadcrumb */}
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Campaigns
          </Link>

          {/* Step indicator */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">New Campaign</h1>
            <div className="flex items-center gap-2 mt-4">
              {STEPS.map((label, idx) => {
                const n = idx + 1;
                const done = n < step;
                const active = n === step;
                return (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${done ? "bg-brand-600 text-white" : active ? "bg-brand-600 text-white ring-4 ring-brand-100" : "bg-gray-200 text-gray-500"}`}>
                      {done ? "✓" : n}
                    </div>
                    <span className={`text-sm font-medium ${active ? "text-brand-600" : done ? "text-gray-600" : "text-gray-400"}`}>{label}</span>
                    {idx < STEPS.length - 1 && <div className={`w-8 h-0.5 ${done ? "bg-brand-400" : "bg-gray-200"}`} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

            {/* Step 1: Details */}
            {step === 1 && (
              <>
                <Input
                  label="Campaign Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. May Sale Blast"
                  autoFocus
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Campaign Type</label>
                  <div className="flex gap-3">
                    {(["template", "non_template"] as CampaignType[]).map((t) => (
                      <label
                        key={t}
                        className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border cursor-pointer transition-all ${campaignType === t ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <input
                          type="radio"
                          value={t}
                          checked={campaignType === t}
                          onChange={() => setCampaignType(t)}
                          className="accent-brand-600"
                        />
                        <span className="text-sm font-medium text-gray-800">
                          {t === "template" ? "WhatsApp Template" : "Free Text"}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {campaignType === "template"
                      ? "Use pre-approved Meta templates. Required for first-time messaging."
                      : "Send a custom text message. Only works within 24h of last contact reply."}
                  </p>
                </div>
              </>
            )}

            {/* Step 2: Message */}
            {step === 2 && campaignType === "template" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Select Template</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Choose an approved template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                </div>
                {selectedTemplate && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Preview</p>
                    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {selectedTemplate.bodyText ?? "No body text"}
                    </div>
                  </div>
                )}
                {selectedTemplate && carouselCardCount === 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">
                      Media URL <span className="text-gray-400 text-xs font-normal">(optional — overrides template header image)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="https://… or choose from library"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => setMediaPickerOpen(true)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
                      >
                        Library
                      </button>
                    </div>
                  </div>
                )}
                {selectedTemplate && carouselCardCount > 0 && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Carousel Card Images
                      <span className="text-gray-400 text-xs font-normal ml-1">({carouselCardCount} cards — one image URL per card)</span>
                    </label>
                    {Array.from({ length: carouselCardCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-14 shrink-0">Card {i + 1}</span>
                        <input
                          value={cardMediaUrls[i] ?? ""}
                          onChange={(e) => {
                            const next = [...cardMediaUrls];
                            next[i] = e.target.value;
                            setCardMediaUrls(next);
                          }}
                          placeholder="https://…"
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {templates.length === 0 && (
                  <p className="text-sm text-gray-400">No approved templates found. <Link href="/templates" className="text-brand-600 hover:underline">Create one →</Link></p>
                )}
              </div>
            )}

            {step === 2 && campaignType === "non_template" && (
              <div className="space-y-4">
                {presets.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Load from preset</label>
                    <select
                      onChange={(e) => {
                        const p = presets.find((p) => p.id === e.target.value);
                        if (p) setFreeTextBody(p.content);
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      defaultValue=""
                    >
                      <option value="">Pick a saved preset…</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Message Body</label>
                  <textarea
                    value={freeTextBody}
                    onChange={(e) => setFreeTextBody(e.target.value)}
                    rows={5}
                    placeholder="Type your message… Use {{name}}, {{phone}}, {{email}} for personalization."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                  <p className="text-xs text-gray-400">{freeTextBody.length} characters</p>
                </div>
              </div>
            )}

            {/* Step 3: Audience */}
            {step === 3 && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Target Audience</label>
                  <div className="flex gap-2">
                    {(["all", "groups", "segment"] as AudienceMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setAudienceMode(m)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all capitalize ${audienceMode === m ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        {m === "all" ? "All Contacts" : m === "groups" ? "Groups" : "Segment"}
                      </button>
                    ))}
                  </div>
                </div>

                {audienceMode === "groups" && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Select one or more groups:</p>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-3">
                      {groups.length === 0 && <p className="col-span-2 text-sm text-gray-400 text-center py-4">No groups yet</p>}
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={(e) =>
                              setSelectedGroupIds((prev) =>
                                e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                              )
                            }
                            className="rounded accent-brand-600"
                          />
                          <span className="text-sm text-gray-800 truncate">{g.title}</span>
                          <span className="text-xs text-gray-400 ml-auto shrink-0">{g._count.contacts}</span>
                        </label>
                      ))}
                    </div>
                    {estimatedCount !== null && estimatedCount > 0 && (
                      <p className="text-sm font-semibold text-green-700 bg-green-50 rounded-lg px-3 py-2">
                        ~{estimatedCount.toLocaleString()} contacts will receive this campaign
                      </p>
                    )}
                  </div>
                )}

                {audienceMode === "segment" && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Segment</label>
                    <select
                      value={segmentId}
                      onChange={(e) => setSegmentId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Select a segment…</option>
                      {segments.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {segments.length === 0 && (
                      <p className="text-xs text-gray-400">No segments yet. <Link href="/contacts/segments" className="text-brand-600 hover:underline">Create one →</Link></p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Message Interval (seconds)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={messageInterval}
                    onChange={(e) => setMessageInterval(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-gray-400">Delay between each message to avoid rate limiting. 0 = send as fast as possible.</p>
                </div>
              </>
            )}

            {/* Step 4: Schedule & Launch */}
            {step === 4 && (
              <>
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Send Time</label>
                  <div className="flex gap-3">
                    {(["now", "later"] as ScheduleMode[]).map((m) => (
                      <label
                        key={m}
                        className={`flex items-center gap-2.5 flex-1 p-3 rounded-xl border cursor-pointer transition-all ${scheduleMode === m ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <input type="radio" value={m} checked={scheduleMode === m} onChange={() => setScheduleMode(m)} className="accent-brand-600" />
                        <span className="text-sm font-medium">{m === "now" ? "Send immediately" : "Schedule for later"}</span>
                      </label>
                    ))}
                  </div>
                  {scheduleMode === "later" && (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  )}
                </div>

                {/* Summary card */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Summary</p>
                  </div>
                  {[
                    { label: "Campaign", value: name },
                    { label: "Type", value: campaignType === "template" ? "WhatsApp Template" : "Free Text" },
                    { label: "Message", value: campaignType === "template" ? (selectedTemplate?.name ?? "—") : (freeTextBody.length > 60 ? `${freeTextBody.slice(0, 60)}…` : freeTextBody) },
                    { label: "Audience", value: audienceMode === "all" ? "All contacts" : audienceMode === "groups" ? `${selectedGroupIds.length} group(s) · ~${estimatedCount ?? 0} contacts` : segments.find(s => s.id === segmentId)?.name ?? "—" },
                    { label: "Interval", value: messageInterval > 0 ? `${messageInterval}s between messages` : "No delay" },
                    { label: "Sends", value: scheduleMode === "now" ? "Immediately" : scheduledAt ? new Date(scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start gap-4 px-4 py-2.5 text-sm">
                      <span className="text-gray-400 w-24 shrink-0">{label}</span>
                      <span className="text-gray-900 font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            {step > 1 ? (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>← Back</Button>
            ) : (
              <Link href="/campaigns"><Button variant="secondary">Cancel</Button></Link>
            )}
            {step < 4 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()}>
                Next →
              </Button>
            ) : (
              <Button
                onClick={() => { void handleLaunch(); }}
                disabled={saving || (scheduleMode === "later" && !scheduledAt)}
              >
                {saving ? "Launching…" : "Launch Campaign"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Toast title={toastState.title} variant={toastState.variant} open={toastState.open} onOpenChange={setToastOpen} />
      <MediaAssetPicker
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(asset: MediaAsset) => { setMediaUrl(asset.fileUrl); setMediaPickerOpen(false); }}
      />
    </WhatsAppGate>
    </PermissionGate>
  );
}
