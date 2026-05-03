import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";

interface UsageData {
  plan: string;
  usage: { contacts: number; messages: number };
  limits: { contacts: number | null; messages: number | null };
}

async function getUsage(token: string): Promise<UsageData | null> {
  try {
    const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/billing/usage`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json() as { data: UsageData }).data;
  } catch { return null; }
}

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

const PLANS = [
  { tier: "starter", label: "Starter", price: "$29/mo", contacts: 500, messages: 1000 },
  { tier: "growth", label: "Growth", price: "$99/mo", contacts: 5000, messages: 20000 },
  { tier: "scale", label: "Scale", price: "$299/mo", contacts: 50000, messages: 200000 },
  { tier: "enterprise", label: "Enterprise", price: "Custom", contacts: null, messages: null },
];

export default async function BillingPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = (await getToken()) ?? "";
  const usage = await getUsage(token);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Billing & Usage</h1>

      {usage && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-800">Current Plan</h2>
            <span className="capitalize bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {usage.plan}
            </span>
          </div>
          <UsageBar used={usage.usage.contacts} limit={usage.limits.contacts} label="Contacts" />
          <UsageBar used={usage.usage.messages} limit={usage.limits.messages} label="Messages this month" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-medium text-gray-800 mb-4">Upgrade Plan</h2>
        <div className="grid grid-cols-1 gap-3">
          {PLANS.map((p) => (
            <div
              key={p.tier}
              className={`flex items-center justify-between p-4 rounded-lg border ${
                usage?.plan === p.tier ? "border-green-500 bg-green-50" : "border-gray-200"
              }`}
            >
              <div>
                <div className="font-medium text-gray-800">{p.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {p.contacts ? `${p.contacts.toLocaleString()} contacts` : "Unlimited contacts"} ·{" "}
                  {p.messages ? `${p.messages.toLocaleString()} messages/mo` : "Unlimited messages"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-800">{p.price}</span>
                {usage?.plan !== p.tier && p.tier !== "enterprise" && (
                  <form action="/api/billing/checkout" method="POST">
                    <input type="hidden" name="planTier" value={p.tier} />
                    <button
                      type="submit"
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                    >
                      Upgrade
                    </button>
                  </form>
                )}
                {p.tier === "enterprise" && (
                  <a href="mailto:sales@WBMSG.io" className="text-xs text-green-600 hover:underline">
                    Contact us
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-medium text-gray-800 mb-2">Manage Subscription</h2>
        <p className="text-sm text-gray-500 mb-4">View invoices and update payment details in the Stripe portal.</p>
        <form action="/api/billing/portal" method="POST">
          <button
            type="submit"
            className="text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Open Billing Portal
          </button>
        </form>
      </div>
    </div>
  );
}
