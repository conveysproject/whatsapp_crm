"use client";

import type { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { bandAt, fetchMessageUsage, formatCount, formatInr, formatUsd } from "@/lib/message-usage";

interface Props {
  /** Contacts this campaign will be sent to, when known (null for "all contacts" and segments). */
  recipients: number | null;
}

/**
 * "Before you send" estimate on the campaign launch step. Shown only to people who may see billing (the usage
 * endpoint refuses everyone else, and then nothing is rendered). It is an upper bound: only messages Meta charges for count.
 */
export function CampaignEstimate({ recipients }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const q = useQuery({
    queryKey: ["billing-message-usage"],
    queryFn: ({ signal }) => fetchMessageUsage(getToken, signal),
    retry: false,
    staleTime: 60_000,
  });
  const usage = q.data;
  if (!usage || !usage.plan) return null;
  const plan = usage.plan;

  const rows: Array<[string, string]> = [["Used so far this month", formatCount(usage.billable)]];
  let footer: string;
  let tone = "bg-gray-50 text-gray-700";

  if (recipients !== null && recipients > 0) {
    const after = usage.billable + recipients;
    rows.unshift(["Messages this can count", `up to ${formatCount(recipients)}`]);
    rows.push(["After sending", `up to ${formatCount(after)}`]);
    if (plan.published) {
      const now = bandAt(plan, usage.billable);
      const next = bandAt(plan, after);
      if (now && next && now.name === next.name) {
        footer = `You stay in ${next.name}. Your bill this month stays ${formatInr(next.inr)} / ${formatUsd(next.usd)}.`;
        tone = "bg-green-50 text-green-800";
      } else if (next) {
        footer = `This could move you to ${next.name}: ${formatInr(next.inr)} / ${formatUsd(next.usd)} a month${next.inr === null ? "" : `, never more than ${formatInr(plan.cap.inr)}`}.`;
        tone = "bg-amber-50 text-amber-900";
      } else {
        footer = "";
      }
    } else {
      footer = after <= plan.freeAllowance ? "You stay within your free messages." : `This could go past your ${formatCount(plan.freeAllowance)} free messages.`;
    }
  } else {
    footer = "The number of recipients is not known until you send. Only messages Meta charges for are counted.";
  }

  return (
    <div data-testid="campaign-estimate" className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Message usage</p>
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="text-gray-600">{label}</span>
          <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
        </div>
      ))}
      {footer && <p className={`px-4 py-3 text-sm rounded-b-xl ${tone}`}>{footer}</p>}
      <p className="px-4 py-2.5 text-xs text-gray-500">
        This is an upper estimate: messages that fail, or that Meta does not charge for, are not counted. WhatsApp&apos;s own charge for the campaign is billed to you by Meta.
      </p>
    </div>
  );
}
