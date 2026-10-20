import { queryOptions, useQuery } from "@tanstack/react-query";
import type { OrgFlags } from "@/lib/parent-orgs";

export interface CurrentOrganization extends OrgFlags {
  id: string;
  name: string;
}

/**
 * Own cache key: the legacy ["org-me"] key holds the `{ data: {...} }` envelope for other consumers
 * (ProfileMenu, inbox, teams). Sharing it would make the cached shape depend on which fetch finished last.
 */
export const ORG_FLAGS_QUERY_KEY = ["org-flags"] as const;

export const orgFlagsQueryOptions = queryOptions<CurrentOrganization | null>({
  queryKey: ORG_FLAGS_QUERY_KEY,
  queryFn: async () => {
    const res = await fetch("/api/v1/organizations/me");
    if (!res.ok) throw new Error(`organizations/me ${res.status}`);
    const json = await res.json() as { data?: CurrentOrganization };
    return json.data ?? null;
  },
  staleTime: 60_000,
});

export function useOrganization(): { org: CurrentOrganization | null; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery(orgFlagsQueryOptions);
  return { org: data ?? null, isLoading, isError };
}
