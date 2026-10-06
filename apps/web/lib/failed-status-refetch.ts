/** True only when the cached infinite-query pages of THIS thread contain the failed message's wamid. */
export function shouldRefetchForFailedStatus(cacheData: unknown, wamid: string): boolean {
  if (!wamid || typeof cacheData !== "object" || cacheData === null) return false;
  const pages = (cacheData as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return false;
  return pages.some((page: unknown) => {
    const data = typeof page === "object" && page !== null ? (page as { data?: unknown }).data : undefined;
    return Array.isArray(data) && data.some((m: unknown) => typeof m === "object" && m !== null && (m as { whatsappMessageId?: unknown }).whatsappMessageId === wamid);
  });
}

/** Trailing debounce: a burst of trigger() calls runs fn once, `ms` after the last call. */
export function createCoalescer(fn: () => void, ms: number): { trigger: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    trigger() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(); }, ms);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
