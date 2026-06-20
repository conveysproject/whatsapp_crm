"use client";

import { JSX } from "react";
import { usePathname } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";

const LABELS: Record<string, string> = {
  contacts: "Contacts",
  campaigns: "Campaigns",
  templates: "Templates",
  flows: "Flows",
  deals: "Deals",
  settings: "Settings",
  inbox: "Inbox",
  analytics: "Analytics",
  dashboard: "Dashboard",
  new: "New",
  "trust-score": "Trust Score",
  members: "Members",
  branding: "Branding",
  billing: "Billing",
  labels: "Labels",
  "vendor-settings": "Advanced Settings",
  "whatsapp-account": "WhatsApp Account",
  routing: "Routing Rules",
  "media-library": "Media Library",
  "custom-fields": "Custom Fields",
  "contact-settings": "Contact Settings",
  "webhook-actions": "Webhook Actions",
  notifications: "Notifications",
};

export function BreadcrumbNav(): JSX.Element | null {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  const items: { label: string; href?: string }[] = [{ label: "Home", href: "/dashboard" }];
  let href = "";
  for (const segment of segments) {
    href += `/${segment}`;
    const label = LABELS[segment] ?? (segment.length === 36 ? "Detail" : segment.charAt(0).toUpperCase() + segment.slice(1));
    const isLast = items.length >= segments.length;
    items.push({ label, ...(isLast ? {} : { href }) });
  }

  if (items.length <= 2) return null;

  return <Breadcrumb items={items} />;
}
