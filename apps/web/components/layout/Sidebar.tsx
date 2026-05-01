"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JSX } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "◻",  exact: true },
  { href: "/inbox",     label: "Inbox",     icon: "✉" },
  { href: "/contacts",  label: "Contacts",  icon: "👤" },
  { href: "/companies", label: "Companies", icon: "🏢" },
  { href: "/campaigns", label: "Campaigns", icon: "📢" },
  { href: "/templates", label: "Templates", icon: "📋" },
  { href: "/flows",     label: "Flows",     icon: "⚡" },
  { href: "/deals",     label: "Deals",     icon: "💼" },
  { href: "/settings",  label: "Settings",  icon: "⚙" },
];

export function Sidebar(): JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-200">
        <span className="text-wa-green font-bold text-xl">✓</span>
        <span className="font-semibold text-gray-900">TrustCRM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon, exact }) => {
          const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")}
            >
              <span className="w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
