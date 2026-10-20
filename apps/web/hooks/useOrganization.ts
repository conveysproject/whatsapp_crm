import { useQuery } from "@tanstack/react-query";
import type { OrgFlags } from "@/lib/parent-orgs";

export interface CurrentOrganization extends OrgFlags {
  id: string;
  name: string;
}

export function useOrganization(): { org: CurrentOrganization | null; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery<CurrentOrganization | null>({
    queryKey: ["org-me"],
    queryFn: async () => {
      const res = await fetch("/api/v1/organizations/me");
      if (!res.ok) throw new Error(`organizations/me ${res.status}`);
      const json = await res.json() as { data?: CurrentOrganization };
      return json.data ?? null;
    },
    staleTime: 60_000,
  });
  return { org: data ?? null, isLoading, isError };
}
