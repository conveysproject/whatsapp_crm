"use client";

import { JSX, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/inbox",    label: "Inbox",       exact: true },
  { href: "/messages", label: "Message Log" },
];

export default function InboxLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const isInbox = pathname === "/inbox";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex gap-1 border-b border-gray-200 bg-white px-4 shrink-0">
        {TABS.map(({ href, label, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
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

      <div className={isInbox ? "flex flex-1 overflow-hidden" : "flex-1 overflow-auto p-6"}>
        {children}
      </div>
    </div>
  );
}
