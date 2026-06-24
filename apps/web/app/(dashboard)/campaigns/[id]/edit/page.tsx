"use client";

import { JSX, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccessSub } from "@/lib/can";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  campaignType: string;
  templateId: string | null;
  status: string;
}

export default function EditCampaignPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const { toast, toastState, setToastOpen } = useToast();
  const { user, isLoading: userLoading } = useCurrentUser();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [name, setName] = useState("");
  const [freeTextBody, setFreeTextBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) { setLoading(false); return; }
      const data = (await res.json() as { data: Campaign }).data;
      setCampaign(data);
      setName(data.name);
      if (data.campaignType !== "template") setFreeTextBody(data.templateId ?? "");
      setLoading(false);
    }
    void load();
  }, [id, getToken]);

  async function handleSave() {
    if (!campaign) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/campaigns/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(campaign.campaignType !== "template" ? { textBody: freeTextBody, campaignType: campaign.campaignType } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } };
        toast(err.error?.message ?? "Failed to save", { variant: "error" });
        return;
      }
      router.push(`/campaigns/${id}`);
    } finally {
      setSaving(false);
    }
  }

  if (!userLoading && !canAccessSub(user, "campaigns_access", "campaigns_create")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="text-lg font-semibold text-gray-900">Access Denied</p>
        <p className="text-sm text-gray-500">You don’t have permission to edit campaigns.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!campaign || campaign.status !== "draft") {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <p className="text-gray-500">This campaign cannot be edited.</p>
        <Link href="/campaigns" className="mt-3 inline-block text-sm text-brand-600 hover:underline">← Back to Campaigns</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-lg mx-auto px-6 py-6 space-y-6">

        <Link href={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Campaign
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Edit Campaign</h1>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <Input
            label="Campaign Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {campaign.campaignType !== "template" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Message Body</label>
              <textarea
                value={freeTextBody}
                onChange={(e) => setFreeTextBody(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          )}

          {campaign.campaignType === "template" && (
            <p className="text-sm text-gray-400">Template campaigns use the template selected at creation. To change the template, create a new campaign.</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button onClick={() => { void handleSave(); }} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
          <Link href={`/campaigns/${id}`}>
            <Button variant="secondary">Cancel</Button>
          </Link>
        </div>
      </div>

      <Toast title={toastState.title} variant={toastState.variant} open={toastState.open} onOpenChange={setToastOpen} />
    </div>
  );
}
