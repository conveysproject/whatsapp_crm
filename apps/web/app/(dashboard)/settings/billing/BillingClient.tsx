"use client";

import type { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { MessageUsagePanel } from "@/components/billing/MessageUsagePanel";
import type { MessageUsage } from "@/lib/message-usage";

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

interface Props {
  messageUsage: MessageUsage | null;
  subscription: SubscriptionData | null;
  transactions: Transaction[];
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function BillingClient({ messageUsage, subscription, transactions }: Props): JSX.Element {
  const { getToken } = useAuth();

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

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Billing &amp; Usage</h1>

      <MessageUsagePanel usage={messageUsage} variant="full" />

      <section data-testid="how-billing-works" className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-medium text-gray-800 mb-2">How billing works</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-600">
          <li>Your WBMSG bill will be based on how many messages you send each month, in simple volume bands, with a monthly maximum.</li>
          <li>WhatsApp&apos;s own per-message charges are billed to you directly by Meta. WBMSG adds no markup to them.</li>
          <li>Pricing is not final yet. Nothing is charged for messages today, and we will share the bands before any charge starts.</li>
        </ul>
        <p className="mt-3 text-sm text-gray-500">
          Questions about billing? <a href="mailto:info@conveys.in" className="text-green-700 hover:underline">info@conveys.in</a>
        </p>
      </section>

      {(subscription?.stripe || subscription?.manual) && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-2">Your subscription</h2>
          {subscription.stripe && (
            <p className="text-sm text-gray-600">
              Renews {new Date(subscription.stripe.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: "medium" })} · Status: {subscription.stripe.status}
            </p>
          )}
          {subscription.manual && (
            <p className="text-sm text-gray-600">
              Manual subscription · {subscription.manual.chargesFrequency} · Status: {subscription.manual.status}
              {subscription.manual.expiresAt ? ` · Expires: ${new Date(subscription.manual.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}
            </p>
          )}
          {subscription.stripe && (
            <button
              onClick={() => { void openPortal(); }}
              className="mt-4 text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Open Billing Portal
            </button>
          )}
        </section>
      )}

      {transactions.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
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
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.status === "paid" || t.status === "success" || t.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
