import * as React from "react";
import { parseBrand, type Brand } from "@/lib/brand";

// React's per-request cache exists in the Next server runtime; elsewhere (tests) it is a plain pass-through.
const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

// Same shape rule as the API's validateSlug (3 to 40 characters, lowercase letters, digits, single hyphens inside).
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isSlugFormat(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length >= 3 && slug.length <= 40 && SLUG_RE.test(slug);
}

/**
 * The public brand of a white-label slug for the branded sign-in pages, or null when the page must fall back to the
 * normal WBMSG page. Null is the single answer for an invalid, unknown, disabled or failed lookup (timeout, 429, 5xx,
 * malformed body), so a visitor cannot tell the reasons apart and slugs cannot be enumerated.
 *
 * Next caches only 200 responses, for 60 seconds (`revalidate`); the API rate-limits this endpoint per client IP and the
 * web server calls it from a shared egress IP, so a 429 simply gives null (the normal page) until the next try.
 */
export const fetchPublicBrand = requestCache(async (slug: string, timeoutMs = 3000): Promise<Brand | null> => {
  if (!isSlugFormat(slug)) return null;
  const apiUrl = (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/v1/public/brand/${slug}`, {
      next: { revalidate: 60 },
      signal: controller.signal,
    } as RequestInit);
    if (res.status !== 200) return null;
    const body = (await res.json()) as { data?: unknown } | null;
    const brand = parseBrand(body?.data);
    if (brand.isDefault || brand.slug !== slug) return null;
    return brand;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
});
