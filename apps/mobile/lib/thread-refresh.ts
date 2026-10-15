import type { QueryClient } from "@tanstack/react-query";

interface Paged { pages: unknown[]; pageParams: unknown[] }

/**
 * Message threads are infinite queries; invalidating one refetches every loaded page,
 * and a new message shifts the cursors so older pages can skip or repeat rows.
 * Keep only the newest page before invalidating so the refetch is a single clean request.
 */
export function trimThreadToNewestPage(qc: QueryClient, conversationId?: string): void {
  qc.setQueriesData<unknown>(
    { queryKey: conversationId ? ["messages", conversationId] : ["messages"] },
    (d: unknown) => {
      const p = d as Paged | undefined;
      return p && Array.isArray(p.pages) ? { pages: p.pages.slice(0, 1), pageParams: (p.pageParams ?? []).slice(0, 1) } : d;
    },
  );
}
