"use client";

import type { JSX } from "react";
import { useBrand } from "@/hooks/useBrand";

/** The brand's name as text, for server components that cannot call useBrand. */
export function BrandName(): JSX.Element {
  return <>{useBrand().name}</>;
}
