"use client";
import { JSX } from "react";
import Link from "next/link";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { DarkModeToggle } from "@/components/layout/DarkModeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { useSocket } from "@/hooks/useSocket";
import { useOrganization } from "@clerk/nextjs";

interface TopBarProps {
  orgName?: string;
  userId?: string;
}

export function TopBar({ orgName, userId }: TopBarProps): JSX.Element {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  useSocket(orgId, userId);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 h-14">
      <span className="text-sm text-gray-500">{orgName ?? ""}</span>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        <DarkModeToggle />
        {/* Settings gear */}
        <Link
          href="/settings"
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
