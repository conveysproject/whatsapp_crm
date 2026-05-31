"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { JSX, useState } from "react";

interface NavChild {
  href: string;
  label: string;
  exact?: boolean;
}

interface NavItem {
  href?: string;
  label: string;
  icon: string;
  exact?: boolean;
  children?: NavChild[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "◻", exact: true },
  { href: "/inbox",    label: "Inbox",       icon: "✉", exact: true },
  { href: "/messages", label: "Message Log", icon: "📋" },
  {
    label: "Contacts",
    icon: "👤",
    children: [
      { href: "/contacts",                  label: "All Contacts", exact: true },
      { href: "/contacts/groups",           label: "Groups" },
      { href: "/contacts/segments",         label: "Segments" },
      { href: "/contacts/import",           label: "Import" },
      { href: "/settings/custom-fields",    label: "Custom Fields" },
    ],
  },
  { href: "/companies",           label: "Companies",   icon: "🏢" },
  { href: "/campaigns",           label: "Campaigns",   icon: "📢" },
  { href: "/templates",           label: "Templates",   icon: "📋" },
  { href: "/flows",               label: "Flows",       icon: "⚡" },
  { href: "/deals",               label: "Deals",       icon: "💼" },
  { href: "/analytics",            label: "Analytics",   icon: "📊" },
  { href: "/trust-score",         label: "Trust Score", icon: "🛡" },
  { href: "/settings",            label: "Settings",    icon: "⚙" },
];

function isChildActive(children: NavChild[], pathname: string): boolean {
  return children.some((c) =>
    c.exact ? pathname === c.href : pathname === c.href || pathname.startsWith(c.href + "/")
  );
}

export function Sidebar(): JSX.Element {
  const pathname = usePathname();

  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

  function isOpen(item: NavItem): boolean {
    if (!item.children) return false;
    return !!(manualExpanded[item.label] || isChildActive(item.children, pathname));
  }

  function toggle(label: string, children: NavChild[]) {
    const currentlyOpen = !!(manualExpanded[label] || isChildActive(children, pathname));
    setManualExpanded((prev) => ({ ...prev, [label]: !currentlyOpen }));
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-gray-200">
      <div className="flex items-center px-4 py-5 border-b border-gray-200">
        <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "36px", width: "auto" }} priority />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          if (item.children) {
            const open = isOpen(item);
            const parentActive = isChildActive(item.children, pathname);

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggle(item.label, item.children!)}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    parentActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  ].join(" ")}
                >
                  <span className="w-5 text-center shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className={`text-xs text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
                    ›
                  </span>
                </button>

                {open && (
                  <div className="mt-0.5 ml-4 pl-4 border-l border-gray-200 space-y-0.5">
                    {item.children.map((child) => {
                      const isActive = child.exact
                        ? pathname === child.href
                        : pathname === child.href || pathname.startsWith(child.href + "/");
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={[
                            "flex items-center px-3 py-1.5 rounded-lg text-sm transition-colors",
                            isActive
                              ? "bg-brand-50 text-brand-700 font-medium"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
                          ].join(" ")}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Flat item
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith((item.href ?? "") + "/");
          return (
            <Link
              key={item.href}
              href={item.href ?? "#"}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
