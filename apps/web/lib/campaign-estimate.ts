import { bandAt, formatCount, formatInr, formatUsd, type MessageUsage } from "./message-usage";

export interface Estimate {
  rows: Array<[string, string]>;
  footer: string;
  tone: "green" | "amber" | "plain";
}

/**
 * The "before you send" numbers for a campaign: what it could add to this period's count, and what that does to the
 * band. An upper estimate (failed messages and messages Meta does not charge for are not counted). `recipients` is null
 * when the audience size is not known yet.
 */
export function buildEstimate(usage: MessageUsage, recipients: number | null): Estimate | null {
  const plan = usage.plan;
  if (!plan) return null;
  const rows: Array<[string, string]> = [["Used so far this period", formatCount(usage.billable)]];
  if (recipients === null || recipients <= 0) {
    return { rows, footer: "The number of recipients is not known yet. Only messages Meta charges for are counted.", tone: "plain" };
  }
  const after = usage.billable + recipients;
  rows.unshift(["Messages this can count", `up to ${formatCount(recipients)}`]);
  rows.push(["After sending", `up to ${formatCount(after)}`]);
  if (!plan.published) {
    return {
      rows,
      footer: after <= plan.freeAllowance ? "You stay within your free messages." : `This could go past your ${formatCount(plan.freeAllowance)} free messages.`,
      tone: "plain",
    };
  }
  const now = bandAt(plan, usage.billable);
  const next = bandAt(plan, after);
  if (now && next && now.name === next.name) {
    return { rows, footer: `You stay in ${next.name}. Your bill this period stays ${formatInr(next.inr)} / ${formatUsd(next.usd)}.`, tone: "green" };
  }
  if (next) {
    return { rows, footer: `This could move you to ${next.name}: ${formatInr(next.inr)} / ${formatUsd(next.usd)} a month, never more than ${formatInr(plan.cap.inr)}.`, tone: "amber" };
  }
  return { rows, footer: "", tone: "plain" };
}
