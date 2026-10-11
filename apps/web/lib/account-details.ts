/** Pure helpers for the Account Details settings page. */

export type BadgeTone = "green" | "red" | "gray";

export function statusBadge(status: string): { label: string; tone: BadgeTone } {
  if (status === "active") return { label: "Active", tone: "green" };
  if (status === "banned") return { label: "Suspended", tone: "red" };
  const s = status.trim().replace(/_/g, " ");
  if (!s) return { label: "Unknown", tone: "gray" };
  return { label: s.charAt(0).toUpperCase() + s.slice(1), tone: "gray" };
}

export function isWhatsAppConnected(org: { whatsappBusinessAccountId: string | null; phoneNumberId: string | null }): boolean {
  return Boolean(org.whatsappBusinessAccountId && org.phoneNumberId);
}

/** Whole percent of the free allowance used, clamped to 0-100. A zero allowance reads as full once anything is used. */
export function usagePercent(used: number, allowance: number): number {
  if (used <= 0) return 0;
  if (allowance <= 0) return 100;
  return Math.min(100, Math.round((used / allowance) * 100));
}

export interface ProfileFields {
  phone: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  facebookPageId: string | null;
  instagramAccountId: string | null;
}

const PROFILE_LABELS: Array<[keyof ProfileFields, string]> = [
  ["phone", "Phone"],
  ["website", "Website"],
  ["location", "Location"],
  ["industry", "Industry"],
  ["facebookPageId", "Facebook Page ID"],
  ["instagramAccountId", "Instagram Account ID"],
];

export function profileRows(org: ProfileFields): Array<{ label: string; value: string }> {
  return PROFILE_LABELS.flatMap(([key, label]) => {
    const value = org[key]?.trim();
    return value ? [{ label, value }] : [];
  });
}
