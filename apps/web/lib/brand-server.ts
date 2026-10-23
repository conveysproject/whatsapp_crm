import * as React from "react";
import { DEFAULT_BRAND, fetchBrandServer, type Brand } from "@/lib/brand";
import { serverApiHeaders } from "@/lib/server-api";

// React's per-request cache exists in the Next server runtime; elsewhere (tests) it is a plain pass-through.
const requestCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

/**
 * The effective brand for this request, fetched once and shared by the layout and generateMetadata.
 * Same headers as the other dashboard fetches (bearer + impersonation token). Never throws.
 */
export const loadRequestBrand = requestCache(async (token: string): Promise<Brand> => {
  try {
    return await fetchBrandServer(await serverApiHeaders(token));
  } catch {
    return DEFAULT_BRAND;
  }
});
