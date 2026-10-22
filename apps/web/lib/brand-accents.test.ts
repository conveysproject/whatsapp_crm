import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import colors from "tailwindcss/colors";

/**
 * The brand scale brand-50..900 defaults to Tailwind green-50..900 exactly (globals.css), so a green-N -> brand-N swap
 * is a no-op for the default look and follows a client brand otherwise. See docs/white-label-color-audit.md.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Brand-accent files (kept in sync with docs/white-label-color-audit.md). They must not use green-N (50..900) or a green hex literal. */
export const ACCENT_FILES: string[] = [
  "app/(dashboard)/contacts/[id]/ContactDealsTab.tsx",
  "app/(dashboard)/contacts/[id]/ContactTimeline.tsx",
  "app/(dashboard)/deals/page.tsx",
  "app/(dashboard)/flows/ai-intent-matching/page.tsx",
  "app/(dashboard)/flows/basic-automation/business-hours-card.tsx",
  "app/(dashboard)/flows/basic-automation/delayed-card.tsx",
  "app/(dashboard)/flows/basic-automation/ooo-card.tsx",
  "app/(dashboard)/flows/basic-automation/welcome-card.tsx",
  "app/(dashboard)/parent/[childId]/page.tsx",
  "app/(dashboard)/parent/page.tsx",
  "app/(dashboard)/settings/ai/page.tsx",
  "app/(dashboard)/settings/api-usage/page.tsx",
  "app/(dashboard)/settings/contact-settings/tabs/CustomFieldsManager.tsx",
  "app/(dashboard)/settings/notifications/page.tsx",
  "app/(dashboard)/settings/roles/page.tsx",
  "app/(dashboard)/settings/security/page.tsx",
  "app/(dashboard)/settings/vendor-settings/page.tsx",
  "app/(dashboard)/settings/webhook-actions/page.tsx",
  "app/(dashboard)/templates/TemplateActions.tsx",
  "app/(onboarding)/checklist/page.tsx",
  "app/(onboarding)/connect-waba/page.tsx",
  "app/(onboarding)/invite-team/page.tsx",
  "app/(onboarding)/provision-number/page.tsx",
  "components/analytics/ConversationChart.tsx",
  "components/analytics/ConversationsTab.tsx",
  "components/analytics/TeamLeaderboard.tsx",
  "components/bot-panel.tsx",
  "components/dashboard/CampaignFunnel.tsx",
  "components/dashboard/HeadsUpCard.tsx",
  "components/dashboard/KpiGrid.tsx",
  "components/dashboard/RangePicker.tsx",
  "components/deals/AddDealModal.tsx",
  "components/deals/CreateOfferModal.tsx",
  "components/deals/CreatePipelineModal.tsx",
  "components/deals/DealSlideOver.tsx",
  "components/flows/FlowEditor.tsx",
  "components/flows/utils/serialize.ts",
  "components/inbox/ContactPanel.tsx",
  "components/inbox/ConversationHeader.tsx",
  "components/inbox/SendMessageForm.tsx",
  "components/inbox/TemplatePicker.tsx",
  "components/media-url-field.tsx",
  "components/parent/InviteClientForm.tsx",
  "components/permissions-grid.tsx",
  "components/segments/SegmentBuilderV2.tsx",
  "components/settings/ApiCredentialsSection.tsx",
  "components/settings/CredentialRevealDialog.tsx",
  "components/settings/SecuritySignInMethods.tsx",
  "components/settings/api-usage/CallbackAttempts.tsx",
  "components/settings/api-usage/UsageTables.tsx",
  "components/templates/analytics/AnalyticsHeader.tsx",
  "components/ui/NewBadge.tsx",
  "components/voice-player.tsx",
  "components/whatsapp/ConnectWhatsAppModal.tsx"
];

/** Lines in an accent file that deliberately stay green (semantic success/status, WhatsApp-specific), by distinctive substring. */
export const KEPT_GREEN: Record<string, string[]> = {
  "app/(dashboard)/contacts/[id]/ContactDealsTab.tsx": [
    "won:         \"bg-green-100 text-green-700\","
  ],
  "app/(dashboard)/contacts/[id]/ContactTimeline.tsx": [
    "deal: \"bg-green-400\","
  ],
  "app/(dashboard)/flows/ai-intent-matching/page.tsx": [
    "<div className=\"bg-green-50 rounded-lg p-3 border border-green-200 max",
    "<p className=\"text-xs text-green-600 font-medium mb-1\">✓ Order Trackin",
    "<span className=\"mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-50"
  ],
  "app/(dashboard)/flows/basic-automation/business-hours-card.tsx": [
    "{saved && <span className=\"text-sm text-green-600\">Saved!</span>}"
  ],
  "app/(dashboard)/flows/basic-automation/delayed-card.tsx": [
    "{saved && <span className=\"text-sm text-green-600\">Saved!</span>}"
  ],
  "app/(dashboard)/flows/basic-automation/ooo-card.tsx": [
    "{saved && <span className=\"text-sm text-green-600\">Saved!</span>}"
  ],
  "app/(dashboard)/flows/basic-automation/welcome-card.tsx": [
    "{saved && <span className=\"text-sm text-green-600\">Saved!</span>}"
  ],
  "app/(dashboard)/settings/roles/page.tsx": [
    "<span className=\"text-sm text-green-600\">Saved successfully</span>"
  ],
  "app/(dashboard)/settings/security/page.tsx": [
    "{done && <p role=\"status\" className=\"text-sm text-green-700\">Password "
  ],
  "app/(dashboard)/templates/TemplateActions.tsx": [
    "className=\"text-xs text-green-600 underline\"",
    "<p className=\"text-sm text-green-600 font-medium text-center\">",
    "<span className={r.ok ? \"text-green-600\" : \"text-red-500\"}>"
  ],
  "app/(onboarding)/checklist/page.tsx": [
    "step.done ? \"bg-green-500 text-white\" : \"border-2 border-gray-300 text"
  ],
  "app/(onboarding)/invite-team/page.tsx": [
    "<span className=\"text-green-500\">&#10003;</span> {e}"
  ],
  "components/analytics/TeamLeaderboard.tsx": [
    "<td className=\"px-4 py-2.5 text-right font-semibold text-green-700\">{a"
  ],
  "components/dashboard/CampaignFunnel.tsx": [
    "{ key: \"sent\", label: \"Sent\", bar: \"bg-green-500\" },",
    "{ key: \"delivered\", label: \"Delivered\", bar: \"bg-green-400\" },",
    "{ key: \"read\", label: \"Read\", bar: \"bg-green-300\" },"
  ],
  "components/dashboard/KpiGrid.tsx": [
    "className={`text-xs font-medium ${d.up !== lowerIsBetter ? \"text-green"
  ],
  "components/deals/CreateOfferModal.tsx": [
    "<svg className=\"w-5 h-5 animate-spin text-green-600\" fill=\"none\" viewB"
  ],
  "components/flows/FlowEditor.tsx": [
    "? \"border-green-300 bg-green-50 text-green-700 hover:bg-green-100\"",
    "isActive ? \"bg-green-500\" : \"bg-gray-400\""
  ],
  "components/inbox/ContactPanel.tsx": [
    "{notesSaved && <span className=\"text-xs text-green-600\">Saved</span>}"
  ],
  "components/inbox/ConversationHeader.tsx": [
    "{ value: \"open\", label: \"Open\", color: \"text-green-600\" },"
  ],
  "components/inbox/TemplatePicker.tsx": [
    "<div className=\"mt-2 pt-2 border-t border-green-200 flex flex-wrap gap",
    "<span key={i} className=\"px-2 py-0.5 bg-white rounded-full text-[11px]",
    "<p className=\"text-[11px] text-green-600 mt-1.5\">Sending…</p>"
  ],
  "components/parent/InviteClientForm.tsx": [
    "<p role=\"status\" className=\"text-sm text-green-700\">Invitation created"
  ],
  "components/settings/api-usage/UsageTables.tsx": [
    "<span className={`text-xs px-2 py-0.5 rounded-full ${r.revoked ? \"bg-g"
  ],
  "components/settings/ApiCredentialsSection.tsx": [
    "className={`text-xs px-2 py-0.5 rounded-full ${revoked ? \"bg-gray-200 "
  ],
  "components/templates/analytics/AnalyticsHeader.tsx": [
    "green: \"bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-gre",
    "const QUALITY_DOT: Record<string, string> = { GREEN: \"bg-green-500\", Y"
  ],
  "components/whatsapp/ConnectWhatsAppModal.tsx": [
    "<span className=\"text-xs font-medium bg-green-100 text-green-700 px-2 ",
    "<svg className=\"w-4 h-4 text-green-500 shrink-0\" fill=\"currentColor\" v",
    "<div className=\"border border-green-200 rounded-xl p-4 space-y-3\">",
    "<span className=\"text-xs font-medium bg-green-600 text-white px-2 py-0",
    "<div className=\"border border-green-400 bg-green-50 rounded-lg px-3 py",
    "<div className=\"flex items-center gap-2 text-green-700 min-w-0\">",
    "<p className=\"text-xs text-green-600\">Document uploaded successfully</",
    "className=\"w-full py-2 border border-dashed border-green-400 text-gree",
    "const color = orange ? \"text-orange-600\" : green ? \"text-green-600\" : "
  ]
};

const GREEN_CLASS = /(?<![\w-])(?:[a-z0-9\[\]-]+:)*[a-z]+-green-(?:50|100|200|300|400|500|600|700|800|900)(?:\/\d+)?(?![\w-])/;
const GREEN_HEX = /#(?:22c55e|16a34a|15803d|4ade80|86efac|bbf7d0|dcfce7|f0fdf4|166534|14532d)\b/i;
const KEPT_HEX: Record<string, string[]> = {
  "components/analytics/ConversationsTab.tsx": ["resolved:"],
};

function toHex(triplet: string): string {
  return "#" + triplet.trim().split(/\s+/).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

describe("brand scale equals Tailwind green by default", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
  const green = colors.green as Record<string, string>;

  it.each(SHADES)("--brand-%i default triplet equals green-%i", (n) => {
    const m = root.match(new RegExp("--brand-" + n + ":\\s*([0-9 ]+);"));
    expect(m, "--brand-" + n + " missing in :root of globals.css").not.toBeNull();
    expect(toHex(m![1]!)).toBe(green[String(n)]!.toLowerCase());
  });
});

describe("accent files follow the brand", () => {
  it("lists files that exist", () => {
    for (const f of ACCENT_FILES) expect(() => readFileSync(join(ROOT, f), "utf8"), f).not.toThrow();
  });

  it.each(ACCENT_FILES)("%s has no stray green-N class or green hex", (f) => {
    const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
    const okGreen = KEPT_GREEN[f] ?? [];
    const okHex = KEPT_HEX[f] ?? [];
    const offenders = lines
      .map((l, i) => ({ l: l.trim(), n: i + 1 }))
      .filter(({ l }) => (GREEN_CLASS.test(l) && !okGreen.some((k) => l.includes(k))) || (GREEN_HEX.test(l) && !okHex.some((k) => l.includes(k))))
      .map(({ l, n }) => n + ": " + l.slice(0, 100));
    expect(offenders).toEqual([]);
  });
});
