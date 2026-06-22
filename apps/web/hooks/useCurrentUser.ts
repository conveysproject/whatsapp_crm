import { useQuery } from "@tanstack/react-query";
import type { CurrentUser } from "@/lib/can";

export function useCurrentUser(): { user: CurrentUser | null; isLoading: boolean } {
  const { data, isLoading } = useQuery<CurrentUser | null>({
    queryKey: ["user-me"],
    queryFn: async () => {
      const res = await fetch("/api/v1/users/me");
      if (!res.ok) return null;
      const json = await res.json() as { data?: CurrentUser };
      return json.data ?? null;
    },
    staleTime: 60_000,
  });
  return { user: data ?? null, isLoading };
}
