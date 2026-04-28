import { UserButton } from "@clerk/nextjs";
import { JSX } from "react";
import { GlobalSearch } from "@/components/search/GlobalSearch";

interface TopBarProps {
  orgName?: string;
}

export function TopBar({ orgName }: TopBarProps): JSX.Element {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 h-14">
      <span className="text-sm text-gray-500">{orgName ?? ""}</span>
      <div className="flex items-center gap-4">
        <GlobalSearch />
        <UserButton />
      </div>
    </header>
  );
}
