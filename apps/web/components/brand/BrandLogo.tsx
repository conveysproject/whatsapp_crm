"use client";

import Image from "next/image";
import type { JSX } from "react";
import { useBrand } from "@/hooks/useBrand";

interface BrandLogoProps {
  /** Rendered height in CSS pixels. */
  height: number;
  /** "small" is for narrow slots (a collapsed sidebar): the small logo, else the full one. */
  variant?: "full" | "small";
  priority?: boolean;
}

/**
 * The brand's logo. The default brand keeps today's WBMSG logo file. A branded org gets its own logo from the
 * validated https URL in the brand (plain <img>: the host is the client's, not one of next/image's remotePatterns),
 * or a text wordmark of its name when it has no image. It never shows the WBMSG logo.
 */
export function BrandLogo({ height, variant = "full", priority }: BrandLogoProps): JSX.Element {
  const brand = useBrand();
  if (brand.isDefault) {
    return <Image src="/wbmsg_logo.png" alt={brand.name} width={200} height={56} style={{ height: `${height}px`, width: "auto" }} priority={priority} />;
  }

  const light = variant === "small" ? (brand.smallLogoUrl ?? brand.logoUrl) : brand.logoUrl;
  const dark = variant === "small" ? (brand.darkSmallLogoUrl ?? brand.darkLogoUrl) : brand.darkLogoUrl;
  const style = { height: `${height}px`, width: "auto" };

  if (!light) {
    return (
      <span title={brand.name} className="font-bold text-gray-900 truncate" style={{ fontSize: `${Math.round(height * 0.6)}px`, lineHeight: `${height}px` }}>
        {brand.name}
      </span>
    );
  }
  /* eslint-disable @next/next/no-img-element */
  if (!dark) return <img src={light} alt={brand.name} style={style} />;
  return (
    <>
      <img src={light} alt={brand.name} style={style} className="dark:hidden" />
      <img src={dark} alt={brand.name} style={style} className="hidden dark:block" />
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
