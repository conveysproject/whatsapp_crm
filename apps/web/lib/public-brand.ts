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

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;

interface Entry {
  brand: Brand | null;
  at: number;
}
const cache = new Map<string, Entry>();
let clock: () => number = () => Date.now();

/** Test hooks: the time source and a way to start from an empty cache. */
export function setPublicBrandClock(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}
export function clearPublicBrandCache(): void {
  cache.clear();
}

function remember(slug: string, brand: Brand | null): void {
  cache.delete(slug);
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  cache.set(slug, { brand, at: clock() });
}

async function lookup(slug: string, timeoutMs: number): Promise<Brand | null> {
  const apiUrl = (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/+$/, "");
  // Server-to-server key: the API gives requests carrying it a high rate limit, because every web request reaches the
  // API from a few shared egress IPs. Server-only env; without it the normal per-IP limit applies.
  const serverKey = process.env["PUBLIC_BRAND_SERVER_KEY"];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/v1/public/brand/${slug}`, {
      cache: "no-store",
      headers: serverKey ? { "x-brand-server-key": serverKey } : {},
      signal: controller.signal,
    });
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
}

/**
 * The public brand of a white-label slug for the branded sign-in pages, or null when the page must fall back to the
 * normal WBMSG page. Null is the single answer for an invalid, unknown, disabled or failed lookup (timeout, 429, 5xx,
 * malformed body), so a visitor cannot tell the reasons apart and slugs cannot be enumerated.
 *
 * Next's fetch cache would keep serving a revoked brand while its background refresh fails, so the request is
 * `no-store` and this module keeps its own small cache: 60 s for hits and for misses alike (a revoked slug is gone within
 * a minute, and probing random slugs costs at most one upstream call per slug per minute per server instance), at most
 * 500 slugs, oldest evicted first. Never throws.
 */
export const fetchPublicBrand = requestCache(async (slug: string, timeoutMs = 3000): Promise<Brand | null> => {
  if (!isSlugFormat(slug)) return null;
  const hit = cache.get(slug);
  if (hit && clock() - hit.at < TTL_MS) return hit.brand;
  const brand = await lookup(slug, timeoutMs);
  remember(slug, brand);
  return brand;
});
