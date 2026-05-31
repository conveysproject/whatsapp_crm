"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface UsageData {
  plan: string;
  usage: { contacts: number; messages: number };
  limits: { contacts: number | null; messages: number | null };
}

interface SubscriptionData {
  planTier: string;
  stripe: { id: string; status: string; currentPeriodEnd: string } | null;
  manual: { id: string; status: string; charges: string; chargesFrequency: string; expiresAt: string | null } | null;
}

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  createdAt: string;
}

interface Plan {
  tier: string;
  name: string;
  priceInr: number | null;
  priceUsd: number | null;
  limits: { contacts: number | null; messages: number | null };
}

interface Props {
  usage: UsageData | null;
  subscription: SubscriptionData | null;
  plans: Plan[];
  transactions: Transaction[];
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function UsageBar({ used, limit, label }: { used: number; limit: number | null; label: string }): JSX.Element {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-500">
          {used.toLocaleString()} / {limit ? limit.toLocaleString() : "Unlimited"}
        </span>
      </div>
      {limit && (
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${pct > 85 ? "bg-red-500" : "bg-green-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function BillingClient({ usage, subscription, plans, transactions }: Props): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);

  async function switchPlan(tier: string) {
    setSwitching(tier);
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/billing/switch-plan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ planTier: tier }),
    });
    setSwitching(null);
    if (res.ok) router.refresh();
  }

  async function openPortal() {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/billing/portal`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (res.ok) {
      const json = await res.json() as { data: { url: string } };
      window.location.href = json.data.url;
    }
  }

  const currentPlan = subscription?.planTier ?? usage?.plan ?? "starter";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Billing & Usage</h1>

      {/* Current plan + usage */}
      {usage && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-800">Current Plan</h2>
            <span className="capitalize bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {currentPlan}
            </span>
          </div>
          {subscription?.stripe && (
            <p className="text-xs text-gray-500 mb-4">
              Renews {new Date(subscription.stripe.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: "medium" })} · Status: {subscription.stripe.status}
            </p>
          )}
          {subscription?.manual && (
            <p className="text-xs text-gray-500 mb-4">
              Manual subscription · {subscription.manual.chargesFrequency} · Status: {subscription.manual.status}
              {subscription.manual.expiresAt ? ` · Expires: ${new Date(subscription.manual.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}
            </p>
          )}
          <UsageBar used={usage.usage.contacts} limit={usage.limits.contacts} label="Contacts" />
          <UsageBar used={usage.usage.messages} limit={usage.limits.messages} label="Messages this month" />
        </div>
      )}

      {/* Plan comparison */}
      {plans.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-4">Plans</h2>
          <div className="grid grid-cols-1 gap-3">
            {plans.map((p) => {
              const isCurrent = currentPlan === p.tier;
              const canSwitch = !isCurrent && p.tier !== "enterprise" && !!subscription?.stripe;
              return (
                <div
                  key={p.tier}
                  className={`flex items-center justify-between p-4 rounded-lg border ${isCurrent ? "border-green-500 bg-green-50" : "border-gray-200"}`}
                >
                  <div>
                    <div className="font-medium text-gray-800">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.limits.contacts ? `${p.limits.contacts.toLocaleString()} contacts` : "Unlimited contacts"} ·{" "}
                      {p.limits.messages ? `${p.limits.messages.toLocaleString()} msg/mo` : "Unlimited messages"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.priceUsd != null && (
                      <span className="text-sm font-semibold text-gray-800">
                        ${p.priceUsd}/mo
                      </span>
                    )}
                    {canSwitch && (
                      <button
                        onClick={() => { void switchPlan(p.tier); }}
                        disabled={switching === p.tier}
                        className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {switching === p.tier ? "Switching…" : (p.priceUsd && p.priceUsd > (plans.find((pp) => pp.tier === currentPlan)?.priceUsd ?? 0) ? "Upgrade" : "Downgrade")}
                      </button>
                    )}
                    {!isCurrent && !canSwitch && p.tier !== "enterprise" && (
                      <a href={`/settings/billing/checkout?plan=${p.tier}`} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">
                        Subscribe
                      </a>
                    )}
                    {p.tier === "enterprise" && (
                      <a href="mailto:sales@trustcrm.in" className="text-xs text-green-600 hover:underline">
                        Contact us
                      </a>
                    )}
                    {isCurrent && <span className="text-xs text-green-700 font-medium">Current</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-4">Transaction History</h2>
          <div className="divide-y divide-gray-100">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm text-gray-900">
                    {t.currency?.toUpperCase()} {(t.amount / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{t.gateway} · {new Date(t.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.status === "paid" || t.status === "success" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stripe portal */}
      {subscription?.stripe && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-2">Manage Subscription</h2>
          <p className="text-sm text-gray-500 mb-4">View invoices and update payment details in the Stripe portal.</p>
          <button
            onClick={() => { void openPortal(); }}
            className="text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Open Billing Portal
          </button>
        </div>
      )}
    </div>
  );
}
