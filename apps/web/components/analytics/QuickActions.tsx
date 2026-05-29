import { JSX } from "react";
import Link from "next/link";

const ACTIONS = [
  { label: "New Campaign", href: "/campaigns/new", icon: "📢" },
  { label: "Import Contacts", href: "/contacts/import", icon: "👥" },
  { label: "Open Inbox", href: "/inbox", icon: "💬" },
  { label: "New Template", href: "/templates/new", icon: "📝" },
] as const;

export function QuickActions(): JSX.Element {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-sm font-medium text-gray-700"
        >
          <span className="text-base">{action.icon}</span>
          {action.label}
        </Link>
      ))}
    </div>
  );
}
