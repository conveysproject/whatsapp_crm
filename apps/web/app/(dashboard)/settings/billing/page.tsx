import type { JSX } from "react";
import { serverApiHeaders } from "@/lib/server-api";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { canViewBilling } from "@/lib/billing-page";
import { normalizeMessageUsage, type MessageUsage } from "@/lib/message-usage";
import type { CurrentUser } from "@/lib/can";
import { BillingClient } from "./BillingClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

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

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: await serverApiHeaders(token), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json() as { data: T }).data;
  } catch { return null; }
}

async function getCurrentUser(token: string): Promise<CurrentUser | null> {
  try {
    const res = await fetch(`${API_URL}/v1/users/me`, { headers: await serverApiHeaders(token), cache: "no-store" });
    return res.ok ? ((await res.json()) as { data: CurrentUser }).data : null;
  } catch { return null; }
}

export default async function BillingPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = (await getToken()) ?? "";

  const user = await getCurrentUser(token);
  if (!canViewBilling(user)) redirect("/settings");

  const [rawMessageUsage, subscription, transactions] = await Promise.all([
    fetchJson<unknown>(`${API_URL}/v1/billing/message-usage`, token),
    fetchJson<SubscriptionData>(`${API_URL}/v1/billing/subscriptions`, token),
    fetchJson<Transaction[]>(`${API_URL}/v1/billing/transactions`, token),
  ]);
  const messageUsage: MessageUsage | null = normalizeMessageUsage(rawMessageUsage);

  return <BillingClient messageUsage={messageUsage} subscription={subscription} transactions={transactions ?? []} />;
}
