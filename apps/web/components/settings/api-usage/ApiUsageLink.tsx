"use client";

import type { JSX } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccessSub } from "@/lib/can";
import { listCredentials, type ApiCredential } from "@/lib/api-credentials";

/**
 * Settings-index tile for the API usage page. Reuses the credentials query (same key as ApiCredentialsSection) as the
 * availability probe: renders nothing while loading, when the user lacks the permission, and on any error
 * (API_NOT_AVAILABLE, FORBIDDEN, network), so orgs without API access never see it.
 */
export function ApiUsageLink(): JSX.Element | null {
  const { user } = useCurrentUser();
  const allowed = canAccessSub(user, "settings_access", "settings_api_key");
  const { data, isError } = useQuery<ApiCredential[], Error>({
    queryKey: ["api-credentials"],
    queryFn: listCredentials,
    retry: false,
    enabled: allowed,
  });
  if (!allowed || isError || data === undefined) return null;
  return (
    <Link href="/settings/api-usage" className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors">
      <p className="text-sm font-medium text-gray-900">API Usage</p>
      <p className="text-xs text-gray-500 mt-0.5">Requests, errors and usage per credential</p>
    </Link>
  );
}
