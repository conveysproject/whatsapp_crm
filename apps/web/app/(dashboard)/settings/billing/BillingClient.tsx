"use client";

import type { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { BillSummary } from "@/components/billing/BillSummary";
import { BandProgress } from "@/components/billing/BandProgress";
import { UsageDetails } from "@/components/billing/UsageDetails";
import { BandTable } from "@/components/billing/BandTable";
import { alertText, formatCount, formatInr, formatUsd, cycleStartLabel, dueDateLabel, statementStatusLabel, type MessageUsage } from "@/lib/message-usage";

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
  const alertLines = (messageUsage?.alerts ?? [])
    .map((a) => ({ key: a.kind, text: alertText(a.kind, messageUsage?.plan ?? null) }))
    .filter((l): l is { key: string; text: string } => l.text !== null);

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
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Billing &amp; usage</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          One monthly bill, based on how many messages you send. WhatsApp&apos;s own message charges are billed to you by Meta, with no markup from WBMSG.
        </p>
      </div>

      {messageUsage ? (
        <>
          <BillSummary usage={messageUsage} />
          <BandProgress usage={messageUsage} />
          <UsageDetails usage={messageUsage} />
          <BandTable usage={messageUsage} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Counts are refreshed every hour. A message is counted once Meta reports that it is chargeable.
          </p>
        </>
      ) : (
        <section data-testid="message-usage-unavailable" className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Messages this month</h2>
          <p className="mt-1 text-sm text-gray-500">Message count is unavailable right now. Please try again in a few minutes.</p>
        </section>
      )}

      <section data-testid="statements" className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Statements and invoices</h2>
        {messageUsage && messageUsage.statements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Billing period</th>
                  <th className="py-2 pr-3 font-semibold">Messages</th>
                  <th className="py-2 pr-3 font-semibold">Band</th>
                  <th className="py-2 pr-3 font-semibold">Amount</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {messageUsage.statements.map((st) => (
                  <tr key={st.month} className="border-b border-gray-100">
                    <td className="py-2.5 pr-3">{cycleStartLabel(st.month)}</td>
                    <td className="py-2.5 pr-3">{formatCount(st.messages)}</td>
                    <td className="py-2.5 pr-3">{st.bandName}</td>
                    <td className="py-2.5 pr-3">{formatInr(st.amountInr)} / {formatUsd(st.amountUsd)}</td>
                    <td className="py-2.5">
                      <span className={statementStatusLabel(st.status, st.dueAt) === "Overdue" ? "font-semibold text-red-700" : ""}>{statementStatusLabel(st.status, st.dueAt)}</span>
                      {st.status === "issued" && st.dueAt ? <span className="block text-xs text-gray-500">Due {dueDateLabel(st.dueAt)}</span> : null}
                      {st.status === "issued" && st.paymentUrl ? (
                        <a href={st.paymentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800">Pay now</a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            No statements yet. Nothing is charged today. When billing starts, each month&apos;s statement and invoice will appear here, and we will tell you well before the first charge.
          </p>
        )}
      </section>

      <section data-testid="usage-alerts" className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Usage alerts</h2>
        {alertLines.length > 0 && (
          <ul data-testid="usage-alert-list" className="mb-3 space-y-1.5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            {alertLines.map((l) => <li key={l.key}>{l.text}</li>)}
          </ul>
        )}
        <p className="text-sm text-gray-600">
          Billing admins get a heads-up at 50%, 80%, 95% and 100% of the free allowance, and each time the bill moves to a new band, in the app and, once alert emails are switched on, by email.
        </p>
      </section>

      <p className="text-sm text-gray-500">
        Questions about billing? <a href="mailto:info@conveys.in" className="text-green-700 hover:underline">info@conveys.in</a>
      </p>

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
