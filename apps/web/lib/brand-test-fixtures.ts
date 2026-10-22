import { createElement as h, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { DEFAULT_BRAND, type Brand } from "@/lib/brand";

/** A non-default brand for render tests. Overrides replace single fields. */
export function brandOf(over: Partial<Brand> = {}): Brand {
  return { ...DEFAULT_BRAND, name: "Acme Cloud", isDefault: false, slug: "acme-cloud", ...over };
}

/** A name that would run script if any render path wrote it unescaped. */
export const HOSTILE_NAME = '"><img src=x onerror=alert(1)>';

export const FORBIDDEN_LITERALS = ["WBMSG", "wbmsg.com", "info@conveys.in"] as const;

export function inBrand(brand: Brand, el: ReactElement): ReactElement {
  return h(BrandProvider, { brand }, el);
}

export function inQuery(el: ReactElement, seed?: (qc: QueryClient) => void): ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(qc);
  return h(QueryClientProvider, { client: qc }, el);
}
