import type { ReactNode, JSX } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://WBMSG.com"),
};

/**
 * Public layout — wraps all marketing / public-facing pages.
 *
 * Route group: app/(public)/
 * URL pattern: /, /pricing, /about, /blog, /features, etc.
 *
 * Add new public pages as siblings of page.tsx:
 *   app/(public)/pricing/page.tsx  → WBMSG.com/pricing
 *   app/(public)/about/page.tsx    → WBMSG.com/about
 *
 * This layout is intentionally minimal — each page owns its own
 * Nav and Footer so pages can vary their header treatment.
 * If you find yourself repeating Nav/Footer across pages, extract
 * them into components/public/ and render them here instead.
 */
export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}