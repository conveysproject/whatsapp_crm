"use client";

import { JSX, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/contacts",         label: "All Contacts", exact: true },
  { href: "/contacts/groups",  label: "Groups" },
  { href: "/contacts/segments",label: "Segments" },
  { href: "/contacts/import",  label: "Import" },
];

export default function ContactsLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ href, label, exact }) => {
          const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                isActive
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
