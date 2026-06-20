"use client";
import { JSX } from "react";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { DarkModeToggle } from "@/components/layout/DarkModeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { SettingsMenu } from "@/components/layout/SettingsMenu";
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
        <SettingsMenu />
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
