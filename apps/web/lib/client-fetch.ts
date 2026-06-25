"use client";

import { toast } from "sonner";

interface FetchOptions extends RequestInit {
  token: string;
  silent?: boolean; // set true to suppress the automatic error toast
}

/**
 * Authenticated client-side fetch wrapper.
 * Automatically shows a toast.error when the response is not OK.
 * Returns the raw Response so callers can still read the body on success.
 */
export async function clientFetch(url: string, { token, silent = false, ...init }: FetchOptions): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok && !silent) {
    const body = await res.clone().json().catch(() => null) as { error?: { message?: string } } | null;
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    toast.error(message);
  }

  return res;
}
