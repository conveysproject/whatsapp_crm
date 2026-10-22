"use client";

import { useBrand } from "@/hooks/useBrand";

export interface BrandChartColors {
  /** Primary chart series (palette 500: #22c55e by default). */
  primary: string;
  /** Darker accent such as flow edges (palette 600: #16a34a by default). */
  primaryDark: string;
  /** Lighter accent (palette 400: #4ade80 by default). */
  primaryLight: string;
  /** Paired lighter series next to the primary one (palette 300: #86efac by default). */
  primarySoft: string;
}

/** Hex colors for chart libraries and inline styles, which cannot use the brand-* CSS classes. */
export function useBrandChartColors(): BrandChartColors {
  const { palette } = useBrand();
  return { primary: palette[500], primaryDark: palette[600], primaryLight: palette[400], primarySoft: palette[300] };
}
