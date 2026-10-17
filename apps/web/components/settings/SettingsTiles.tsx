"use client";
import type { JSX } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { visibleSettingsTiles } from "@/lib/settings-tiles";
import { ApiUsageLink } from "@/components/settings/api-usage/ApiUsageLink";

export function SettingsTiles(): JSX.Element {
  const { user } = useCurrentUser();
  return (
    <div className="grid grid-cols-2 gap-3">
      {visibleSettingsTiles(user).map(({ href, label, desc }) => (
        <Link key={href} href={href} className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
        </Link>
      ))}
      <ApiUsageLink />
    </div>
  );
}
