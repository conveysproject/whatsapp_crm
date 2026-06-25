"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { PermissionGate } from "@/components/PermissionGate";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface IntentMatchSettings {
  intentMatchingEnabled: boolean;
  intentMatchCostPaise: number;
}

function PricingModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">AI Intent Match Pricing</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          You are charged only when AI successfully matches intent — not for every query.
        </p>
        <p className="text-sm font-semibold text-gray-800 mb-2">How it works:</p>
        <ul className="text-sm text-gray-700 space-y-1.5 mb-5 list-disc pl-5">
          <li>AI analyzes all incoming queries for free</li>
          <li>You are charged only when a query matches your workflow or triggers an auto-reply</li>
          <li>No charge for unmatched queries</li>
          <li>Charges are automatically deducted from your wallet</li>
        </ul>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-gray-700">
          <p className="font-semibold mb-1">Example:</p>
          <p>
            If you receive <strong>100 queries</strong> and <strong>10 queries</strong> match
            your workflow or auto-reply
          </p>
          <p className="mt-1">Cost calculation:</p>
          <p className="font-semibold mt-0.5">10 matches × ₹0 = ₹0 total</p>
          <p className="text-xs text-gray-500 mt-1">
            *You are NOT charged for the other 90 queries.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiIntentMatchingPage(): JSX.Element {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<IntentMatchSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const t = await getToken();
        const res = await fetch(`${API_URL}/v1/automation/settings/intent-matching`, {
          headers: { Authorization: `Bearer ${t ?? ""}` },
        });
        if (res.ok) {
          const body = await res.json() as { data: IntentMatchSettings };
          setSettings(body.data);
        }
      } catch { /* leave null */ }
    }
    void load();
  }, [getToken]);

  async function handleToggle(): Promise<void> {
    if (!settings || saving) return;
    setSaving(true);
    const next = !settings.intentMatchingEnabled;
    try {
      const t = await getToken();
      const res = await fetch(`${API_URL}/v1/automation/settings/intent-matching`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${t ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ intentMatchingEnabled: next }),
      });
      if (res.ok) {
        const body = await res.json() as { data: IntentMatchSettings };
        setSettings(body.data);
      }
    } catch { /* leave state unchanged */ } finally {
      setSaving(false);
    }
  }

  const enabled = settings?.intentMatchingEnabled ?? false;
  const costPaise = settings?.intentMatchCostPaise ?? 0;
  const costDisplay = costPaise === 0 ? "Free" : `₹${(costPaise / 100).toFixed(2)}`;

  return (
    <PermissionGate permission="automation_access">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg">
              ✦
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">AI Intent Matching</h1>
              <p className="text-sm text-gray-500">Get AI to select your reply to customers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={saving || settings === null}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
              enabled
                ? "bg-green-500 text-white border-green-500 hover:bg-green-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {saving ? "Saving…" : enabled ? "AI Intent Match On" : "Enable AI Intent Match"}
          </button>
        </div>

        {/* Explainer card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-sm text-gray-700 mb-6 leading-relaxed">
            AI Intent Matching understands what your customers are asking and automatically triggers
            the correct auto-reply or chatbot workflow that you&apos;ve already set up. Your existing
            flows stay exactly the same — they just become smarter.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual mockup */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200 max-w-xs">
                <p className="text-xs text-gray-400 mb-1">Customer Message · Received</p>
                <p className="text-sm text-gray-800">
                  I&apos;m unable to track my order. Where is it....when can I expect it to be delivered?
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-200 max-w-xs ml-auto text-right">
                <p className="text-xs text-blue-500 mb-1">✦ AI Analysing Intent…</p>
                <p className="text-xs text-gray-500">Keywords detected: Order · Tracking</p>
                <p className="text-xs text-gray-500">Scanning Automations…</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-200 max-w-xs ml-auto">
                <p className="text-xs text-green-600 font-medium mb-1">✓ Order Tracking Workflow Triggered</p>
                <p className="text-sm text-gray-800">I can help you track your order! Please provide your order number…</p>
              </div>
            </div>

            {/* Feature points */}
            <div className="space-y-4">
              {[
                {
                  title: "Understands messages",
                  desc: "AI understands customer messages even when keywords don't match.",
                },
                {
                  title: "Triggers the right automation",
                  desc: "Ensures the correct auto-reply or chatbot flow fires.",
                },
                {
                  title: "Zero setup required",
                  desc: "Works instantly with everything you already built.",
                },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">
                    ✓
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                    <p className="text-sm text-gray-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-gray-700">
          <span className="text-yellow-500 text-base">ⓘ</span>
          <span>
            <strong>{costDisplay} per successful intent match</strong> will be deducted from your wallet.{" "}
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className="text-brand-600 underline hover:no-underline"
            >
              How pricing works?
            </button>
          </span>
        </div>

        {/* Things to know */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <p className="text-sm font-semibold text-blue-800 mb-3">💡 Things to know.</p>
          <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
            <li>
              Before enabling AI Intent Matching, make sure you have created sufficient auto-replies &amp; workflows.
            </li>
            <li>
              AI Intent Matching works by intelligently routing customer messages to your existing automations.
              The agent will be useful only if there are a good number of auto-replies &amp; workflows covering
              different topics customers might reach out for.
            </li>
          </ul>
          <div className="flex gap-4 mt-4">
            <Link
              href="/flows/auto-replies"
              className="text-sm text-brand-600 font-medium hover:underline"
            >
              Set up Auto-Replies →
            </Link>
            <Link
              href="/flows"
              className="text-sm text-brand-600 font-medium hover:underline"
            >
              Create Workflows →
            </Link>
          </div>
        </div>
      </div>

      {showPricingModal && <PricingModal onClose={() => setShowPricingModal(false)} />}
    </PermissionGate>
  );
}
