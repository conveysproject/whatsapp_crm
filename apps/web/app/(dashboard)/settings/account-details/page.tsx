import type { JSX, ReactNode } from "react";
import Link from "next/link";
import { serverApiHeaders } from "@/lib/server-api";
import { auth } from "@clerk/nextjs/server";
import type { CurrentUser } from "@/lib/can";
import { canViewBilling } from "@/lib/billing-page";
import { formatCount, normalizeMessageUsage, periodLabel, resetLabel, type MessageUsage } from "@/lib/message-usage";
import { isWhatsAppConnected, statusBadge, usagePercent, type BadgeTone } from "@/lib/account-details";
import { CopyButton } from "./CopyButton";
import { ProfileEditor } from "./ProfileEditor";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface OrgData {
  id: string;
  name: string;
  createdAt: string;
  metaBusinessId: string | null;
  whatsappBusinessAccountId: string | null;
  phoneNumberId: string | null;
  phone: string | null;
  subCategory: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  facebookPageId: string | null;
  instagramAccountId: string | null;
  status: string;
}

async function fetchData<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { headers: await serverApiHeaders(token), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json() as { data: T }).data;
  } catch { return null; }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

const TONES: Record<BadgeTone, string> = {
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-gray-100 text-gray-600",
};

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }): JSX.Element {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

function Card({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <h2 className="px-5 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900">{title}</h2>
      <dl className="px-5">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 py-3.5 border-b border-gray-100 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <dt className="text-sm text-gray-500 sm:w-64 sm:shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function IdValue({ value, label }: { value: string | null; label: string }): JSX.Element {
  if (!value) return <span className="text-gray-400">Not set</span>;
  return (
    <>
      <span className="min-w-0 truncate font-mono text-xs sm:text-sm" title={value}>{value}</span>
      <CopyButton value={value} label={label} />
    </>
  );
}

export default async function AccountDetailsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";

  const [org, user] = await Promise.all([
    fetchData<OrgData>("/v1/organizations/me", token),
    fetchData<CurrentUser>("/v1/users/me", token),
  ]);

  if (!org) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Account Details</h1>
        <p role="alert" className="text-sm text-red-600">We couldn&apos;t load your account details. Try again, or contact support if it keeps happening.</p>
        <Link href="/settings/account-details" className="inline-block rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Try again</Link>
      </div>
    );
  }

  // Billing figures are fetched only for people who may see them; the API enforces the same permission.
  const showBilling = canViewBilling(user);
  let usage: MessageUsage | null = null;
  if (showBilling) usage = normalizeMessageUsage(await fetchData<unknown>("/v1/billing/message-usage", token));

  const badge = statusBadge(org.status);
  const connected = isWhatsAppConnected(org);
  const allowance = usage?.plan?.freeAllowance ?? null;
  const pct = usage && allowance !== null ? usagePercent(usage.billable, allowance) : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="text-sm text-gray-500 mt-1">Your organization account information.</p>
      </div>

      <Card title="Organization">
        <Row label="Organization ID"><IdValue value={org.id} label="Organization ID" /></Row>
        <Row label="Created">{formatDate(org.createdAt)}</Row>
      </Card>

      <ProfileEditor
        profile={{ name: org.name, phone: org.phone, website: org.website, location: org.location, industry: org.industry, subCategory: org.subCategory }}
        canEdit={user?.role === "admin" || user?.role === "manager"}
      />

      <Card title="WhatsApp connection">
        <Row label="Status">
          <Badge tone={connected ? "green" : "gray"}>{connected ? "Connected" : "Not connected"}</Badge>
          <Link href="/settings/whatsapp-account" className="text-sm font-normal text-blue-600 hover:underline">
            {connected ? "Manage" : "Connect WhatsApp"}
          </Link>
        </Row>
        <Row label="Facebook Business Manager ID"><IdValue value={org.metaBusinessId} label="Facebook Business Manager ID" /></Row>
        <Row label="WhatsApp Business ID"><IdValue value={org.whatsappBusinessAccountId} label="WhatsApp Business ID" /></Row>
      </Card>

      {showBilling && (
        <Card title="Billing">
          {usage?.cycle && (
            <>
              <Row label="Current billing cycle">{periodLabel(usage.cycle)}</Row>
              <Row label="Counts reset on">{resetLabel(usage.cycle)}</Row>
            </>
          )}
          {usage && allowance !== null && pct !== null && (
            <Row label="Free messages used">
              <div className="w-full max-w-xs">
                <div className="mb-1">{formatCount(usage.billable)} / {formatCount(allowance)}</div>
                <div className="h-2 rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Free messages used">
                  <div className={`h-2 rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </Row>
          )}
          <Row label="Usage and invoices">
            <Link href="/settings/billing" className="font-normal text-blue-600 hover:underline">View usage &amp; billing</Link>
          </Row>
        </Card>
      )}
    </div>
  );
}
