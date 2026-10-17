import { canAccess, canAccessSub, isAdmin, type CurrentUser } from "./can";

// Settings index tiles. Each tile's rule mirrors what its page's API enforces, so users only
// see settings they can actually use. No rule = any user who can open Settings.
type Rule = { perm: string; sub?: string } | { adminOnly: true };

export interface SettingsTile { href: string; label: string; desc: string; rule?: Rule }

export const SETTINGS_TILES: SettingsTile[] = [
  { href: "/settings/members", label: "Members", desc: "Manage team access and permissions", rule: { perm: "settings_access", sub: "settings_agents" } },
  { href: "/settings/teams", label: "Manage Teams", desc: "Organise agents into teams and control visibility", rule: { perm: "settings_access", sub: "settings_teams" } },
  { href: "/settings/roles", label: "Roles", desc: "Default permissions per role", rule: { adminOnly: true } },
  { href: "/settings/whatsapp-account", label: "WhatsApp Account", desc: "Connect your WABA", rule: { perm: "settings_access", sub: "settings_whatsapp" } },
  { href: "/settings/branding", label: "Branding", desc: "Logo, colors, favicon", rule: { adminOnly: true } },
  { href: "/settings/labels", label: "Labels", desc: "Color-coded contact tags", rule: { perm: "settings_access", sub: "settings_tags" } },
  { href: "/settings/inbox-labels", label: "Conversation Labels", desc: "Labels for inbox queue management", rule: { perm: "settings_access", sub: "settings_tags" } },
  { href: "/settings/contact-settings", label: "Contact Settings", desc: "Fields, statuses, configuration & assignment rules", rule: { perm: "contacts_access" } },
  { href: "/settings/notifications", label: "Notifications", desc: "Sound and alert preferences" },
  { href: "/settings/vendor-settings", label: "Advanced Settings", desc: "Bot timing, API credentials" },
  { href: "/settings/webhook-actions", label: "Webhook Actions", desc: "Trigger external webhooks", rule: { perm: "automation_access" } },
  { href: "/settings/media-library", label: "Media Library", desc: "Reusable images, docs, audio" },
  { href: "/settings/canned-responses", label: "Canned Responses", desc: "Saved reply templates with shortcuts", rule: { perm: "automation_access", sub: "automation_bot_replies" } },
  { href: "/settings/routing", label: "Routing Rules", desc: "Auto-assign conversations", rule: { perm: "settings_access", sub: "settings_teams" } },
  { href: "/settings/ai", label: "AI Settings", desc: "Chatbot and automation config" },
  { href: "/settings/billing", label: "Billing", desc: "Subscription and usage", rule: { perm: "settings_access", sub: "settings_billing" } },
];

export function visibleSettingsTiles(user: CurrentUser | null | undefined): SettingsTile[] {
  if (!user) return [];
  return SETTINGS_TILES.filter(({ rule }) => {
    if (!rule) return true;
    if ("adminOnly" in rule) return isAdmin(user);
    return rule.sub ? canAccessSub(user, rule.perm, rule.sub) : canAccess(user, rule.perm);
  });
}
